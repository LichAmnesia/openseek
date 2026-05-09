import type { Command, CommandResult } from "../types.ts";

const commitPushPr: Command = {
  name: "commit-push-pr",
  description: "Chain: git commit → git push → gh pr create. Plans only when no spawn.",
  category: "git",
  isStub: false,
  async handle(ctx): Promise<CommandResult> {
    const msg = (ctx.args ?? []).join(" ").trim() || "wip";
    const plan = [
      ["git", "commit", "-m", msg],
      ["git", "push"],
      ["gh", "pr", "create", "--fill"],
    ];
    if (!ctx.spawn) {
      return {
        kind: "text",
        payload: {
          text: `plan:\n  ${plan.map((c) => c.join(" ")).join("\n  ")}`,
          data: { plan },
        },
      };
    }
    const results: Array<{ cmd: string[]; exitCode: number }> = [];
    for (const cmd of plan) {
      const r = await ctx.spawn(cmd, { cwd: ctx.cwd });
      results.push({ cmd, exitCode: r.exitCode });
      if (r.exitCode !== 0) break;
    }
    return {
      kind: "text",
      payload: {
        text: results.map((r) => `${r.cmd.join(" ")} → ${r.exitCode}`).join("\n"),
        data: { results },
      },
    };
  },
};

export default commitPushPr;
