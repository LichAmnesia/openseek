import { z } from "zod";
import type { Tool, ToolResult } from "../types.ts";

const inputSchema = z.object({
  query: z.string().min(1).describe("Search query string."),
  limit: z
    .number()
    .int()
    .min(1)
    .max(10)
    .optional()
    .describe("Max results to return (default 5)."),
});

type WebSearchInput = z.infer<typeof inputSchema>;

const DEFAULT_LIMIT = 5;
const ENDPOINT = "https://lite.duckduckgo.com/lite/";

// ---------- DI slot for tests ----------
let injectedFetch: typeof fetch | undefined;

export function setWebSearchFetch(impl: typeof fetch | undefined): void {
  injectedFetch = impl;
}

interface SearchResult {
  url: string;
  title: string;
  snippet: string;
}

function decodeEntities(s: string): string {
  return s
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, " ");
}

function stripTags(s: string): string {
  return decodeEntities(s.replace(/<[^>]+>/g, "")).trim();
}

/**
 * Parse the lite.duckduckgo.com HTML. The lite layout uses three rows per
 * result: link, snippet, source. We pull `<a class="result-link">` blocks
 * and the immediately-following snippet `<td class="result-snippet">`.
 */
export function parseDuckLite(html: string, limit: number): SearchResult[] {
  const results: SearchResult[] = [];
  const linkRe =
    /<a[^>]*class="[^"]*result-link[^"]*"[^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/gi;
  const snippetRe =
    /<td[^>]*class="[^"]*result-snippet[^"]*"[^>]*>([\s\S]*?)<\/td>/gi;
  const links: Array<{ url: string; title: string }> = [];
  let m: RegExpExecArray | null;
  // biome-ignore lint/suspicious/noAssignInExpressions: regex iteration idiom
  while ((m = linkRe.exec(html)) !== null) {
    links.push({ url: decodeEntities(m[1] ?? ""), title: stripTags(m[2] ?? "") });
  }
  const snippets: string[] = [];
  // biome-ignore lint/suspicious/noAssignInExpressions: regex iteration idiom
  while ((m = snippetRe.exec(html)) !== null) {
    snippets.push(stripTags(m[1] ?? ""));
  }
  for (let i = 0; i < links.length && results.length < limit; i++) {
    const link = links[i];
    if (!link) continue;
    results.push({
      url: link.url,
      title: link.title,
      snippet: snippets[i] ?? "",
    });
  }
  return results;
}

// ---------- Tavily backend (default when TAVILY_API_KEY is set) ----------
//
// DuckDuckGo Lite is keyless but thin: fresh product pages routinely return
// zero hits, which pushes the agent into blind web_fetch loops (observed
// 2026-07-15 — 17 searches, most empty, then 29 raw fetches). Tavily is a
// purpose-built LLM search API with much better recall; DDG stays as the
// keyless fallback.

const TAVILY_ENDPOINT = "https://api.tavily.com/search";

interface TavilyResponse {
  results?: Array<{ url?: string; title?: string; content?: string }>;
}

async function searchTavily(
  query: string,
  limit: number,
  apiKey: string,
  fetchFn: typeof fetch,
  signal: AbortSignal,
): Promise<SearchResult[]> {
  const res = await fetchFn(TAVILY_ENDPOINT, {
    method: "POST",
    signal,
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      query,
      max_results: limit,
      search_depth: "basic",
      include_answer: false,
    }),
  });
  if (!res.ok) {
    throw new Error(`tavily HTTP ${res.status} ${res.statusText}`);
  }
  const data = (await res.json()) as TavilyResponse;
  return (data.results ?? []).slice(0, limit).map((r) => ({
    url: r.url ?? "",
    title: r.title ?? "",
    // Tavily "content" is an extracted passage; cap it to snippet size so
    // one search can't flood the conversation.
    snippet: (r.content ?? "").slice(0, 500),
  }));
}

async function searchDuckLite(
  query: string,
  limit: number,
  fetchFn: typeof fetch,
  signal: AbortSignal,
): Promise<SearchResult[]> {
  const url = `${ENDPOINT}?q=${encodeURIComponent(query)}`;
  const res = await fetchFn(url, {
    signal,
    headers: {
      "user-agent": "Mozilla/5.0 (compatible; openseek/0.0; +https://openseek)",
    },
  });
  if (!res.ok) {
    throw new Error(`duckduckgo HTTP ${res.status} ${res.statusText}`);
  }
  return parseDuckLite(await res.text(), limit);
}

const webSearch: Tool<typeof inputSchema> = {
  name: "web_search",
  description:
    "Search the public web (Tavily when TAVILY_API_KEY is set, DuckDuckGo lite otherwise). Returns up to `limit` results (default 5) with title / url / snippet.",
  inputSchema,
  permission: "auto",
  async call(input: WebSearchInput, ctx): Promise<ToolResult> {
    const limit = input.limit ?? DEFAULT_LIMIT;
    const fetchFn = injectedFetch ?? fetch;
    const tavilyKey = process.env.TAVILY_API_KEY?.trim();

    let hits: SearchResult[];
    let backend: string;
    try {
      if (tavilyKey) {
        backend = "tavily";
        try {
          hits = await searchTavily(input.query, limit, tavilyKey, fetchFn, ctx.abort);
        } catch (err) {
          // Tavily down / quota exceeded → degrade to keyless DDG rather
          // than failing the tool call outright.
          ctx.log.warn(
            `web_search tavily failed (${err instanceof Error ? err.message : String(err)}) — falling back to duckduckgo`,
          );
          backend = "duckduckgo (tavily fallback)";
          hits = await searchDuckLite(input.query, limit, fetchFn, ctx.abort);
        }
      } else {
        backend = "duckduckgo";
        hits = await searchDuckLite(input.query, limit, fetchFn, ctx.abort);
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      return { kind: "error", message: `web_search failed: ${msg}` };
    }

    if (hits.length === 0) {
      return {
        kind: "text",
        text: `# query: ${input.query}\n# backend: ${backend}\n\n_no results_`,
      };
    }
    const lines: string[] = [`# query: ${input.query}`, `# backend: ${backend}`, ""];
    hits.forEach((h, i) => {
      lines.push(`${i + 1}. ${h.title || h.url}`);
      lines.push(`   ${h.url}`);
      if (h.snippet) lines.push(`   ${h.snippet}`);
      lines.push("");
    });
    return { kind: "text", text: lines.join("\n").trimEnd() };
  },
};

export default webSearch;
