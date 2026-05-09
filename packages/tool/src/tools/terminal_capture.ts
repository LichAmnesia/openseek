import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { z } from "zod";
import type { Tool, ToolResult } from "../types.ts";

function resolveHome(): string {
  return process.env.HOME ?? homedir();
}

const inputSchema = z.object({
  scope: z
    .enum(["last", "session"])
    .optional()
    .describe("'last' = tail recent lines (default); 'session' = whole log."),
  lines: z
    .number()
    .int()
    .min(1)
    .max(10_000)
    .optional()
    .describe("Number of trailing lines to return for scope='last' (default 200)."),
  sessionId: z
    .string()
    .min(1)
    .optional()
    .describe("Session id; defaults to the most-recently-modified ~/.openseek/logs/*.log."),
  maxBytes: z
    .number()
    .int()
    .min(1024)
    .max(2_000_000)
    .optional()
    .describe("Truncation cap on the returned text (default 200_000)."),
});

type TerminalCaptureInput = z.infer<typeof inputSchema>;

const DEFAULT_LINES = 200;
const DEFAULT_MAX_BYTES = 200_000;

export function defaultLogsDir(): string {
  return join(resolveHome(), ".openseek", "logs");
}

function pickLogFile(dir: string, sessionId: string | undefined): string | null {
  if (sessionId) {
    const direct = join(dir, `${sessionId}.log`);
    if (existsSync(direct)) return direct;
    return null;
  }
  if (!existsSync(dir)) return null;
  let entries: string[];
  try {
    entries = readdirSync(dir).filter((f) => f.endsWith(".log"));
  } catch {
    return null;
  }
  let best: { path: string; mtime: number } | null = null;
  for (const e of entries) {
    const p = join(dir, e);
    try {
      const s = statSync(p);
      if (!best || s.mtimeMs > best.mtime) best = { path: p, mtime: s.mtimeMs };
    } catch {
      // ignore
    }
  }
  return best?.path ?? null;
}

const terminalCapture: Tool<typeof inputSchema> = {
  name: "terminal_capture",
  description:
    "Read the agent's own terminal scrollback by tailing ~/.openseek/logs/<session>.log. scope='last' returns the trailing N lines; scope='session' returns the whole log.",
  inputSchema,
  permission: "auto",
  async call(input: TerminalCaptureInput, ctx): Promise<ToolResult> {
    const scope = input.scope ?? "last";
    const lines = input.lines ?? DEFAULT_LINES;
    const maxBytes = input.maxBytes ?? DEFAULT_MAX_BYTES;
    const dir = defaultLogsDir();
    const file = pickLogFile(dir, input.sessionId);
    if (!file) {
      const hint = input.sessionId
        ? `no log for session=${input.sessionId} at ${dir}`
        : `no logs in ${dir} (CLI/TUI not configured to write here yet)`;
      return { kind: "text", text: `[terminal_capture] ${hint}` };
    }
    let raw: string;
    try {
      raw = readFileSync(file, "utf8");
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      return { kind: "error", message: `terminal_capture read failed: ${msg}` };
    }
    let body: string;
    if (scope === "last") {
      const all = raw.split("\n");
      const tail = all.slice(-lines);
      body = tail.join("\n");
    } else {
      body = raw;
    }
    if (body.length > maxBytes) {
      body = `${body.slice(-maxBytes)}\n…[truncated to last ${maxBytes} bytes]`;
    }
    ctx.log.debug("terminal_capture", { file, scope, bytes: body.length });
    return {
      kind: "text",
      text: `[terminal_capture scope=${scope} file=${file}]\n${body}`,
    };
  },
};

export default terminalCapture;
