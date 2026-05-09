import type { Command, CommandResult } from "../types.ts";

const commit: Command = {
  name: "commit",
  description: "Run `git commit -m <msg>` with the args joined as the message.",
  category: "git",
  isStub: false,
  async handle(ctx): Promise<CommandResult> {
    if (!ctx.spawn) {
      return { kind: "text", payload: { text: "no spawn surface available" } };
    }
    const msg = (ctx.args ?? []).join(" ").trim();
    if (!msg) {
      return { kind: "text", payload: { text: "usage: /commit <message>" } };
    }
    const r = await ctx.spawn(["git", "commit", "-m", msg], { cwd: ctx.cwd });
    return {
      kind: "text",
      payload: {
        text: r.exitCode === 0 ? r.stdout.trim() || "(committed)" : `failed: ${r.stderr}`,
        data: { exitCode: r.exitCode, message: msg },
      },
    };
  },
};

export default commit;
