import type { Command, CommandResult } from "../types.ts";

const brief: Command = {
  name: "brief",
  description: "Generate a short briefing line about the active session.",
  category: "advanced",
  isStub: false,
  async handle(ctx): Promise<CommandResult> {
    const model = ctx.session?.model ?? "?";
    const mode = ctx.session?.mode ?? "agent";
    const msgs = ctx.session?.messages?.length ?? 0;
    return {
      kind: "text",
      payload: {
        text: `brief: ${msgs} msgs · model=${model} · mode=${mode}`,
        data: { model, mode, msgs },
      },
    };
  },
};

export default brief;
