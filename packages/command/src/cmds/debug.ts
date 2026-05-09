import type { Command, CommandResult } from "../types.ts";

const debug: Command = {
  name: "debug",
  description: "Toggle debug logging for the current session.",
  category: "advanced",
  isStub: false,
  async handle(ctx): Promise<CommandResult> {
    const next = !(ctx.state?.debug ?? false);
    if (ctx.state) ctx.state.debug = next;
    return {
      kind: "action",
      payload: {
        action: "toggle-debug",
        text: `debug ${next ? "ON" : "OFF"}`,
        data: { debug: next },
      },
    };
  },
};

export default debug;
