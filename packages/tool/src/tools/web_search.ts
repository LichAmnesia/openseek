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

const webSearch: Tool<typeof inputSchema> = {
  name: "web_search",
  description:
    "Search the public web via DuckDuckGo lite. Returns up to `limit` results (default 5) with title / url / snippet.",
  inputSchema,
  permission: "auto",
  async call(input: WebSearchInput, ctx): Promise<ToolResult> {
    const limit = input.limit ?? DEFAULT_LIMIT;
    const fetchFn = injectedFetch ?? fetch;
    const url = `${ENDPOINT}?q=${encodeURIComponent(input.query)}`;
    let res: Response;
    try {
      res = await fetchFn(url, {
        signal: ctx.abort,
        headers: {
          "user-agent":
            "Mozilla/5.0 (compatible; openseek/0.0; +https://openseek)",
        },
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      return { kind: "error", message: `web_search fetch failed: ${msg}` };
    }
    if (!res.ok) {
      return {
        kind: "error",
        message: `web_search HTTP ${res.status} ${res.statusText}`,
      };
    }
    const html = await res.text();
    const hits = parseDuckLite(html, limit);
    if (hits.length === 0) {
      return {
        kind: "text",
        text: `# query: ${input.query}\n\n_no results_`,
      };
    }
    const lines: string[] = [`# query: ${input.query}`, ""];
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
