import type { Command, CommandResult } from "../types.ts";

const rename: Command = {
  name: "rename",
  description: "Rename a file via `git mv <from> <to>`.",
  category: "git",
  isStub: false,
  async handle(ctx): Promise<CommandResult> {
    if (!ctx.spawn) return { kind: "text", payload: { text: "no spawn surface available" } };
    const [from, to] = ctx.args ?? [];
    if (!from || !to) {
      return { kind: "text", payload: { text: "usage: /rename <from> <to>" } };
    }
    const r = await ctx.spawn(["git", "mv", from, to], { cwd: ctx.cwd });
    return {
      kind: "text",
      payload: {
        text: r.exitCode === 0 ? `renamed ${from} → ${to}` : `failed: ${r.stderr}`,
        data: { exitCode: r.exitCode },
      },
    };
  },
};

export default rename;
