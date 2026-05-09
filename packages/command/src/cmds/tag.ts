import type { Command, CommandResult } from "../types.ts";

const tag: Command = {
  name: "tag",
  description: "Create or list git tags.",
  category: "git",
  isStub: false,
  async handle(ctx): Promise<CommandResult> {
    if (!ctx.spawn) return { kind: "text", payload: { text: "no spawn surface available" } };
    const name = ctx.args?.[0];
    const cmd = name ? ["git", "tag", name] : ["git", "tag", "--list"];
    const r = await ctx.spawn(cmd, { cwd: ctx.cwd });
    return {
      kind: "text",
      payload: {
        text: r.exitCode === 0 ? r.stdout.trim() || (name ? `tagged ${name}` : "(no tags)") : `failed: ${r.stderr}`,
        data: { exitCode: r.exitCode },
      },
    };
  },
};

export default tag;
