import type { Command, CommandResult } from "../types.ts";

const diff: Command = {
  name: "diff",
  description: "Show working-tree diff (git diff). v0.4 prints a `git diff` invocation.",
  category: "session",
  isStub: false,
  async handle(ctx): Promise<CommandResult> {
    if (ctx.spawn) {
      const r = await ctx.spawn(["git", "diff", "--stat"], { cwd: ctx.cwd });
      return {
        kind: "text",
        payload: {
          text: r.exitCode === 0 ? r.stdout || "(no diff)" : `git diff failed: ${r.stderr}`,
          data: { exitCode: r.exitCode },
        },
      };
    }
    return { kind: "text", payload: { text: "git diff (no spawn surface available)" } };
  },
};

export default diff;
