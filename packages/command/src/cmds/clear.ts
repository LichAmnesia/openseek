import type { Command, CommandResult } from "../types.ts";

const clear: Command = {
  name: "clear",
  description: "Clear the active session message log without ending the session.",
  category: "session",
  isStub: false,
  async handle(ctx): Promise<CommandResult> {
    const before = ctx.session?.messages?.length ?? 0;
    if (ctx.session?.messages) ctx.session.messages.length = 0;
    return {
      kind: "action",
      payload: {
        action: "clear-history",
        text: `cleared ${before} message(s).`,
        data: { cleared: before },
      },
    };
  },
};

export default clear;
