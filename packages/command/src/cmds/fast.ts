import type { Command, CommandResult } from "../types.ts";

const fast: Command = {
  name: "fast",
  description: "Toggle fast mode (skips reasoning, picks smaller model when configured).",
  category: "session",
  isStub: false,
  async handle(ctx): Promise<CommandResult> {
    const state = ctx.state ?? {};
    const next = !state.fastMode;
    if (ctx.state) ctx.state.fastMode = next;
    return {
      kind: "action",
      payload: {
        action: "toggle-fast",
        text: `fast mode ${next ? "ON" : "OFF"}.`,
        data: { fastMode: next },
      },
    };
  },
};

export default fast;
