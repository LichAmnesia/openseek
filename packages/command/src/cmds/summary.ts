import type { Command, CommandResult } from "../types.ts";

const summary: Command = {
  name: "summary",
  description: "Render a brief summary of the current session for hand-off.",
  category: "session",
  isStub: false,
  async handle(ctx): Promise<CommandResult> {
    const msgs = ctx.session?.messages?.length ?? 0;
    const model = ctx.session?.model ?? "unknown";
    return {
      kind: "text",
      payload: {
        text: `session summary — model=${model}, messages=${msgs}.`,
        data: { model, messages: msgs },
      },
    };
  },
};

export default summary;
