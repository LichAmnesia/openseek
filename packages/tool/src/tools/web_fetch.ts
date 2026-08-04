import { z } from "zod";
import type { Tool, ToolResult } from "../types.ts";
import { getAgentSpawnDeps } from "./agent_spawn.ts";

const inputSchema = z.object({
  url: z.string().url().describe("Absolute http(s) URL to fetch."),
  prompt: z
    .string()
    .min(1)
    .optional()
    .describe(
      "Question to answer against the fetched page. When set, a sub-model " +
        "reads the full page and ONLY the concise answer enters the " +
        "conversation — strongly preferred over raw mode for large pages.",
    ),
  maxBytes: z
    .number()
    .int()
    .min(1024)
    .max(5_000_000)
    .optional()
    .describe(
      "Raw mode only: max chars of converted page text returned, head+tail " +
        "split around a truncation marker (default 40_000 ≈ 10K tokens).",
    ),
});

type WebFetchInput = z.infer<typeof inputSchema>;

// Tool-output budget, Codex-style: ~10K tokens (≈ bytes/4), split half head
// / half tail with a marker in the middle. The old 1MB default let a single
// fetch inject ~250K tokens; a fetch-heavy one-shot run (29 fetches) blew
// past a 131072-token server context (2026-07-15 live run).
const DEFAULT_MAX_BYTES = 40_000;
// Prompt mode feeds the sub-model up to this much page text — the answer,
// not the page, is what returns to the parent conversation (Claude Code
// WebFetch pattern).
const EXTRACT_INPUT_CAP = 120_000;
const EXTRACT_TIMEOUT_MS = 120_000;

/** Head+tail truncation: keep both ends, drop the middle with a marker. */
export function headTailTruncate(s: string, max: number): string {
  if (s.length <= max) return s;
  const half = Math.floor(max / 2);
  const head = s.slice(0, half);
  const tail = s.slice(s.length - half);
  const dropped = s.length - half * 2;
  return `${head}\n\n…[${dropped} chars omitted from the middle — refetch with a larger maxBytes, or pass \`prompt\` to extract instead]…\n\n${tail}`;
}

function stripBlock(html: string, tag: string): string {
  const re = new RegExp(`<${tag}\\b[^>]*>[\\s\\S]*?<\\/${tag}>`, "gi");
  return html.replace(re, "");
}

function htmlToMarkdown(html: string): string {
  let s = html;
  s = stripBlock(s, "script");
  s = stripBlock(s, "style");
  s = stripBlock(s, "nav");
  s = stripBlock(s, "noscript");

  // Headings
  s = s.replace(/<h([1-6])\b[^>]*>([\s\S]*?)<\/h\1>/gi, (_m, level: string, inner: string) => {
    const hashes = "#".repeat(Number(level));
    return `\n${hashes} ${inner.replace(/<[^>]+>/g, "").trim()}\n`;
  });

  // Anchor links → markdown
  s = s.replace(
    /<a\b[^>]*href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi,
    (_m, href: string, inner: string) => {
      const text = inner.replace(/<[^>]+>/g, "").trim();
      return text.length > 0 ? `[${text}](${href})` : href;
    },
  );

  // List items
  s = s.replace(/<li\b[^>]*>([\s\S]*?)<\/li>/gi, (_m, inner: string) => {
    return `- ${inner.replace(/<[^>]+>/g, "").trim()}\n`;
  });

  // Paragraphs
  s = s.replace(/<p\b[^>]*>([\s\S]*?)<\/p>/gi, (_m, inner: string) => {
    return `\n${inner.replace(/<[^>]+>/g, "").trim()}\n`;
  });

  // Line breaks
  s = s.replace(/<br\s*\/?>/gi, "\n");

  // Strip remaining tags
  s = s.replace(/<[^>]+>/g, "");

  // Decode a few common entities
  s = s
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'");

  // Collapse extra blank lines
  s = s.replace(/\n{3,}/g, "\n\n");
  return s.trim();
}

const webFetch: Tool<typeof inputSchema> = {
  name: "web_fetch",
  description:
    "Fetch a URL. With `prompt`, a sub-model reads the page and returns only " +
    "the answer (preferred — keeps the conversation small). Without it, the " +
    "page is converted to markdown and head+tail truncated to maxBytes.",
  inputSchema,
  permission: "auto",
  async call(input: WebFetchInput, ctx): Promise<ToolResult> {
    let res: Response;
    try {
      res = await fetch(input.url, { signal: ctx.abort });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      return { kind: "error", message: `fetch failed: ${msg}` };
    }
    if (!res.ok) {
      return {
        kind: "error",
        message: `fetch returned HTTP ${res.status} ${res.statusText}`,
      };
    }
    const ct = res.headers.get("content-type") ?? "";
    let body: string;
    try {
      body = await res.text();
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      return { kind: "error", message: `read body failed: ${msg}` };
    }
    const isHtml = ct.includes("text/html") || /<html[\s>]/i.test(body);
    const text = isHtml ? htmlToMarkdown(body) : body;

    // Prompt mode (Claude Code WebFetch pattern): the sub-model sees the
    // page, the parent conversation sees only the answer. Falls back to raw
    // mode when the host hasn't wired agent deps or the extraction errors.
    if (input.prompt !== undefined) {
      const extracted = await extractWithSubModel(input.url, text, input.prompt, ctx.abort);
      if (extracted !== null) {
        return {
          kind: "text",
          text: `# ${input.url}\n# extracted (prompt mode)\n\n${extracted}`,
        };
      }
      ctx.log.warn("web_fetch prompt-mode extraction unavailable — returning raw mode");
    }

    const max = input.maxBytes ?? DEFAULT_MAX_BYTES;
    return {
      kind: "text",
      text: `# ${input.url}\n# content-type: ${ct || "(unknown)"}\n\n${headTailTruncate(text, max)}`,
    };
  },
};

/**
 * Run the extraction prompt through a tool-less sub-agent (single LLM turn
 * on the session's provider/model). Returns null when deps are not wired or
 * the sub-agent fails — caller falls back to raw truncated mode.
 */
async function extractWithSubModel(
  url: string,
  pageText: string,
  prompt: string,
  parentAbort: AbortSignal,
): Promise<string | null> {
  const deps = getAgentSpawnDeps();
  if (!deps) return null;
  const { spawnAgent } = await import("@openseek/agent");
  const subPrompt =
    `Below is the text content of ${url}.\n\n<page>\n${pageText.slice(0, EXTRACT_INPUT_CAP)}\n</page>\n\n` +
    `Answer the following against the page content ONLY. Be concise and factual; ` +
    `quote exact values (prices, names, dates) where present; say "not found on page" ` +
    `when the page lacks the answer.\n\nQuestion: ${prompt}`;
  // Tool-less child: the extraction must be a single model turn, never a
  // tool loop of its own.
  const handle = spawnAgent(
    { prompt: subPrompt, timeoutMs: EXTRACT_TIMEOUT_MS },
    { ...deps, tools: new Map() },
  );
  const onParentAbort = (): void => handle.abort();
  if (parentAbort.aborted) handle.abort();
  else parentAbort.addEventListener("abort", onParentAbort, { once: true });
  try {
    const res = await handle.result;
    if (res.status !== "done" || res.output.trim() === "") return null;
    return res.output.trim();
  } catch {
    return null;
  } finally {
    parentAbort.removeEventListener("abort", onParentAbort);
  }
}

export default webFetch;
