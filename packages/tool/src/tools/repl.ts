import { z } from "zod";
import type { Tool, ToolResult } from "../types.ts";

const DEFAULT_TIMEOUT_MS = 30_000;
const MAX_TIMEOUT_MS = 120_000;

const inputSchema = z.object({
  language: z
    .enum(["js", "ts", "python"])
    .optional()
    .describe(
      "Source language (default js). js/ts run via `bun -e`; python runs via `python3 -c`.",
    ),
  code: z.string().min(1).describe("Code snippet to evaluate in a fresh subprocess."),
  timeoutMs: z
    .number()
    .int()
    .min(1)
    .max(MAX_TIMEOUT_MS)
    .optional()
    .describe(`Hard timeout in milliseconds (default ${DEFAULT_TIMEOUT_MS}).`),
});

type ReplInput = z.infer<typeof inputSchema>;
type ReplLanguage = "js" | "ts" | "python";

function commandFor(language: ReplLanguage, code: string): string[] {
  if (language === "python") return ["python3", "-c", code];
  // js + ts: bun handles both
  return ["bun", "-e", code];
}

const repl: Tool<typeof inputSchema> = {
  name: "repl",
  description:
    "Evaluate a small JS/TS/Python snippet in an isolated subprocess. Sandboxing is process-level only — the snippet still inherits the host's filesystem and network. Use for math/string transforms, NOT for arbitrary code review.",
  inputSchema,
  permission: "deny-in-plan",
  async call(input: ReplInput, ctx): Promise<ToolResult> {
    const timeoutMs = input.timeoutMs ?? DEFAULT_TIMEOUT_MS;
    const language: ReplLanguage = input.language ?? "js";
    const argv = commandFor(language, input.code);
    let proc: Bun.Subprocess<"ignore", "pipe", "pipe">;
    try {
      proc = Bun.spawn(argv, {
        cwd: ctx.cwd,
        stdin: "ignore",
        stdout: "pipe",
        stderr: "pipe",
        signal: ctx.abort,
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      return { kind: "error", message: `failed to spawn repl (${language}): ${msg}` };
    }
    let timedOut = false;
    const timer = setTimeout(() => {
      timedOut = true;
      try {
        proc.kill("SIGTERM");
      } catch {
        // ignore
      }
    }, timeoutMs);
    let stdout = "";
    let stderr = "";
    let exitCode: number | null = null;
    try {
      const [outText, errText, code] = await Promise.all([
        new Response(proc.stdout).text(),
        new Response(proc.stderr).text(),
        proc.exited,
      ]);
      stdout = outText;
      stderr = errText;
      exitCode = typeof code === "number" ? code : null;
    } finally {
      clearTimeout(timer);
    }
    if (timedOut) {
      return { kind: "error", message: `repl timed out after ${timeoutMs}ms` };
    }
    const header = `# repl ${language} exit=${exitCode ?? "?"}`;
    const out = stdout.length > 0 ? `\n## stdout\n${stdout}` : "";
    const err = stderr.length > 0 ? `\n## stderr\n${stderr}` : "";
    return { kind: "text", text: `${header}${out}${err}` };
  },
};

export default repl;
