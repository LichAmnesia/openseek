import { isAbsolute, resolve } from "node:path";
import { z } from "zod";
import type { Tool, ToolResult } from "../types.ts";

const inputSchema = z.object({
  branch: z
    .string()
    .min(1)
    .describe("Branch name to check out in the new worktree."),
  path: z
    .string()
    .min(1)
    .optional()
    .describe("Optional explicit worktree path (default '../<branch>' relative to ctx.cwd)."),
  base: z
    .string()
    .min(1)
    .optional()
    .describe(
      "Optional starting commit/ref for the new branch — passed as `git worktree add <path> -b <branch> <base>`.",
    ),
  create: z
    .boolean()
    .optional()
    .describe("If true (default), create the branch (-b). If false, check out an existing branch."),
});

type EnterWorktreeInput = z.infer<typeof inputSchema>;

const enterWorktree: Tool<typeof inputSchema> = {
  name: "enter_worktree",
  description:
    "Create a real `git worktree add` so parallel branches don't collide (G3.5). Runs `git` with ctx.cwd as the working directory and returns stdout/stderr from the underlying process on failure.",
  inputSchema,
  permission: "deny-in-plan",
  async call(input: EnterWorktreeInput, ctx): Promise<ToolResult> {
    const path = input.path ?? `../${input.branch}`;
    const abs = isAbsolute(path) ? resolve(path) : resolve(ctx.cwd, path);

    const args = ["git", "worktree", "add"];
    if (input.create !== false) {
      args.push("-b", input.branch, abs);
      if (input.base) args.push(input.base);
    } else {
      args.push(abs, input.branch);
    }

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
      ctx.log.warn("enter_worktree: git failed", { code, stderr: errText.slice(0, 400) });
      return {
        kind: "error",
        message: `git worktree add failed (exit ${code}): ${errText.trim() || outText.trim()}`,
      };
    }
    return {
      kind: "text",
      text: `[worktree at ${abs} entered (branch=${input.branch})]`,
    };
  },
};

export default enterWorktree;
