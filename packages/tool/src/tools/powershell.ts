import { z } from "zod";
import type { Tool, ToolResult } from "../types.ts";

const DEFAULT_TIMEOUT_MS = 60_000;
const MAX_TIMEOUT_MS = 600_000;

const inputSchema = z.object({
  command: z.string().min(1).describe("PowerShell command to execute (Windows only)."),
  timeoutMs: z
    .number()
    .int()
    .min(1)
    .max(MAX_TIMEOUT_MS)
    .optional()
    .describe(`Hard timeout in milliseconds (default ${DEFAULT_TIMEOUT_MS}).`),
});

type PowerShellInput = z.infer<typeof inputSchema>;

const powershell: Tool<typeof inputSchema> = {
  name: "powershell",
  description:
    "Execute a PowerShell command on Windows. On non-Windows hosts (macOS/Linux) returns an unavailability error so plans surface the platform mismatch.",
  inputSchema,
  permission: "deny-in-plan",
  async call(input: PowerShellInput, ctx): Promise<ToolResult> {
    if (process.platform !== "win32") {
      ctx.log.warn("powershell unavailable on non-Windows host", {
        platform: process.platform,
      });
      return {
        kind: "error",
        message: `powershell unavailable: host platform is ${process.platform}, requires win32`,
      };
    }
    const timeoutMs = input.timeoutMs ?? DEFAULT_TIMEOUT_MS;
    let timedOut = false;
    let proc: Bun.Subprocess<"ignore", "pipe", "pipe">;
    try {
      proc = Bun.spawn(["powershell.exe", "-NoProfile", "-Command", input.command], {
        cwd: ctx.cwd,
        stdin: "ignore",
        stdout: "pipe",
        stderr: "pipe",
        signal: ctx.abort,
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      return { kind: "error", message: `failed to spawn powershell: ${msg}` };
    }
    const timer = setTimeout(() => {
      timedOut = true;
      try {
        proc.kill("SIGTERM");
      } catch {
        // process already gone
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
      return { kind: "error", message: `powershell timed out after ${timeoutMs}ms` };
    }
    const header = `# exit ${exitCode ?? "?"}`;
    const out = stdout.length > 0 ? `\n## stdout\n${stdout}` : "";
    const err = stderr.length > 0 ? `\n## stderr\n${stderr}` : "";
    return { kind: "text", text: `${header}${out}${err}` };
  },
};

export default powershell;
