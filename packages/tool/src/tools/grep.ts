import { z } from "zod";
import type { Tool, ToolResult } from "../types.ts";
import { resolveWithinCwd } from "../workspace.ts";

const inputSchema = z.object({
  pattern: z.string().min(1).describe("Regex (ripgrep syntax) to search for."),
  path: z
    .string()
    .optional()
    .describe("Path within cwd to search. Defaults to cwd."),
  glob: z.string().optional().describe("Optional ripgrep --glob filter (e.g. '*.ts')."),
  caseInsensitive: z.boolean().optional().describe("If true, run with -i."),
  limit: z
    .number()
    .int()
    .min(1)
    .max(5000)
    .optional()
    .describe("Max matching lines to keep (default 500)."),
});

type GrepInput = z.infer<typeof inputSchema>;

const grep: Tool<typeof inputSchema> = {
  name: "grep",
  description: "Full-text regex search via ripgrep (rg). Returns matches as `path:line:text`.",
  inputSchema,
  permission: "auto",
  async call(input: GrepInput, ctx): Promise<ToolResult> {
    const target = input.path
      ? resolveWithinCwd(ctx.cwd, input.path).abs
      : resolveWithinCwd(ctx.cwd, ".").abs;
    const limit = input.limit ?? 500;

    const args = ["rg", "--line-number", "--no-heading", "--color=never"];
    if (input.caseInsensitive) args.push("-i");
    if (input.glob) args.push("--glob", input.glob);
    args.push("--", input.pattern, target);

    let proc: Bun.Subprocess<"ignore", "pipe", "pipe">;
    try {
      proc = Bun.spawn(args, {
        stdin: "ignore",
        stdout: "pipe",
        stderr: "pipe",
        signal: ctx.abort,
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      return {
        kind: "error",
        message: `failed to launch ripgrep: ${msg}. Install via 'brew install ripgrep' or 'apt install ripgrep'.`,
      };
    }

    const [stdout, stderr, exitCode] = await Promise.all([
      new Response(proc.stdout).text(),
      new Response(proc.stderr).text(),
      proc.exited,
    ]);

    // ripgrep exit 1 = no match, 2 = error
    if (exitCode === 2) {
      return { kind: "error", message: `ripgrep error: ${stderr.trim() || "unknown"}` };
    }
    if (exitCode === 1 || stdout.trim() === "") {
      return { kind: "text", text: `(no matches for /${input.pattern}/)` };
    }
    const lines = stdout.split("\n").filter(Boolean);
    const truncated = lines.length > limit;
    const shown = lines.slice(0, limit);
    const footer = truncated ? `\n… ${lines.length - limit} more matches truncated` : "";
    return { kind: "text", text: shown.join("\n") + footer };
  },
};

export default grep;
