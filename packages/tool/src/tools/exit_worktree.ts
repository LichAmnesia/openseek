import { isAbsolute, resolve } from "node:path";
import { z } from "zod";
import type { Tool, ToolResult } from "../types.ts";

const inputSchema = z.object({
  path: z
    .string()
    .min(1)
    .describe("Worktree path to leave / remove. Resolved relative to ctx.cwd if not absolute."),
  remove: z
    .boolean()
    .optional()
    .describe("If true, run `git worktree remove --force <path>` to delete it."),
});

type ExitWorktreeInput = z.infer<typeof inputSchema>;

const exitWorktree: Tool<typeof inputSchema> = {
  name: "exit_worktree",
  description:
    "Leave the active git worktree, optionally invoking `git worktree remove --force <path>` (G3.5).",
  inputSchema,
  permission: "deny-in-plan",
  async call(input: ExitWorktreeInput, ctx): Promise<ToolResult> {
    const abs = isAbsolute(input.path) ? resolve(input.path) : resolve(ctx.cwd, input.path);
    if (!input.remove) {
      ctx.log.info("exit_worktree: no removal requested", { path: abs });
      return { kind: "text", text: `[worktree exited (path=${abs})]` };
    }

    const args = ["git", "worktree", "remove", "--force", abs];
    let proc: Bun.Subprocess<"ignore", "pipe", "pipe">;
    try {
      proc = Bun.spawn(args, {
        cwd: ctx.cwd,
        stdin: "ignore",
        stdout: "pipe",
        stderr: "pipe",
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      return { kind: "error", message: `failed to spawn git: ${msg}` };
    }
    const [outText, errText, code] = await Promise.all([
      new Response(proc.stdout).text(),
      new Response(proc.stderr).text(),
      proc.exited,
    ]);
    if (code !== 0) {
      ctx.log.warn("exit_worktree: git failed", { code, stderr: errText.slice(0, 400) });
      return {
        kind: "error",
        message: `git worktree remove failed (exit ${code}): ${errText.trim() || outText.trim()}`,
      };
    }
    return {
      kind: "text",
      text: `[worktree exited (path=${abs}, removed)]`,
    };
  },
};

export default exitWorktree;
