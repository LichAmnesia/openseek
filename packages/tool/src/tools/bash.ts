import { z } from "zod";
import type { Tool, ToolResult } from "../types.ts";

const DEFAULT_TIMEOUT_MS = 60_000;
const MAX_TIMEOUT_MS = 600_000;

const inputSchema = z.object({
  command: z.string().min(1).describe("Shell command to execute via /bin/sh -c."),
  timeoutMs: z
    .number()
    .int()
    .min(1)
    .max(MAX_TIMEOUT_MS)
    .optional()
    .describe(`Hard timeout in milliseconds (default ${DEFAULT_TIMEOUT_MS}, max ${MAX_TIMEOUT_MS}).`),
});

type BashInput = z.infer<typeof inputSchema>;

const bash: Tool<typeof inputSchema> = {
  name: "bash",
  description:
    "Execute a shell command via /bin/sh -c with a default 60s timeout. Captures stdout, stderr, and exit code.",
  inputSchema,
  permission: "deny-in-plan",
  async call(input: BashInput, ctx): Promise<ToolResult> {
    const timeoutMs = input.timeoutMs ?? DEFAULT_TIMEOUT_MS;
    let timedOut = false;
    let proc: Bun.Subprocess<"ignore", "pipe", "pipe">;
    try {
      proc = Bun.spawn(["/bin/sh", "-c", input.command], {
        cwd: ctx.cwd,
        stdin: "ignore",
        stdout: "pipe",
        stderr: "pipe",
        signal: ctx.abort,
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      return { kind: "error", message: `failed to spawn shell: ${msg}` };
    }

    const timer = setTimeout(() => {
      timedOut = true;
      try {
        proc.kill("SIGTERM");
      } catch {
        // process already gone; ignore
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
      return {
        kind: "error",
        message: `command timed out after ${timeoutMs}ms`,
      };
    }

    const header = `# exit ${exitCode ?? "?"}`;
    const stdoutBlock = stdout.length > 0 ? `\n## stdout\n${stdout}` : "";
    const stderrBlock = stderr.length > 0 ? `\n## stderr\n${stderr}` : "";
    return { kind: "text", text: `${header}${stdoutBlock}${stderrBlock}` };
  },
};

export default bash;
