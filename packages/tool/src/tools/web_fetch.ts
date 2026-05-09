import { z } from "zod";
import type { Tool, ToolResult } from "../types.ts";

const inputSchema = z.object({
  url: z.string().url().describe("Absolute http(s) URL to fetch."),
  maxBytes: z
    .number()
    .int()
    .min(1024)
    .max(5_000_000)
    .optional()
    .describe("Truncate response body after this many bytes (default 1_000_000)."),
});

type WebFetchInput = z.infer<typeof inputSchema>;

const DEFAULT_MAX_BYTES = 1_000_000;

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
    "Fetch a URL and return the body. HTML is converted to a simple markdown approximation; non-HTML content is returned as text.",
  inputSchema,
  permission: "auto",
  async call(input: WebFetchInput, ctx): Promise<ToolResult> {
    const max = input.maxBytes ?? DEFAULT_MAX_BYTES;
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
    if (body.length > max) {
      body = `${body.slice(0, max)}\n…[truncated at ${max} bytes]`;
    }
    const isHtml = ct.includes("text/html") || /<html[\s>]/i.test(body);
    const text = isHtml ? htmlToMarkdown(body) : body;
    return {
      kind: "text",
      text: `# ${input.url}\n# content-type: ${ct || "(unknown)"}\n\n${text}`,
    };
  },
};

export default webFetch;
