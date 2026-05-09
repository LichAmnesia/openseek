import type { Command, CommandResult } from "../types.ts";

const breakCache: Command = {
  name: "break-cache",
  description: "Force a fresh prompt prefix on the next turn (skip provider cache).",
  category: "tools",
  isStub: false,
  async handle(ctx): Promise<CommandResult> {
    if (ctx.state) ctx.state.breakCache = true;
    return {
      kind: "action",
      payload: { action: "break-cache", text: "next turn will skip prefix cache.", data: { breakCache: true } },
    };
  },
};

export default breakCache;
