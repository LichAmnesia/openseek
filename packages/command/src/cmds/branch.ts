import type { Command, CommandResult } from "../types.ts";

const branch: Command = {
  name: "branch",
  description: "Show or create a git branch.",
  category: "git",
  isStub: false,
  async handle(ctx): Promise<CommandResult> {
    if (!ctx.spawn) {
      return { kind: "text", payload: { text: "no spawn surface available" } };
    }
    const next = ctx.args?.[0];
    if (next) {
      const r = await ctx.spawn(["git", "checkout", "-b", next], { cwd: ctx.cwd });
      return {
        kind: "text",
        payload: {
          text: r.exitCode === 0 ? `created branch '${next}'` : `failed: ${r.stderr}`,
          data: { exitCode: r.exitCode },
        },
      };
    }
    const r = await ctx.spawn(["git", "branch", "--show-current"], { cwd: ctx.cwd });
    return {
      kind: "text",
      payload: {
        text: r.exitCode === 0 ? `current branch: ${r.stdout.trim()}` : `failed: ${r.stderr}`,
        data: { exitCode: r.exitCode },
      },
    };
  },
};

export default branch;
