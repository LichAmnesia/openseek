import type { Command, CommandResult } from "../types.ts";

const context: Command = {
  name: "context",
  description: "Show approximate context budget usage for the active session.",
  category: "tools",
  isStub: false,
  async handle(ctx): Promise<CommandResult> {
    const msgs = ctx.session?.messages?.length ?? 0;
    // rough heuristic: 200 tokens / message
    const approx = msgs * 200;
    return {
      kind: "text",
      payload: {
        text: `context — messages=${msgs} approx_tokens=${approx}`,
        data: { messages: msgs, approxTokens: approx },
      },
    };
  },
};

export default context;
