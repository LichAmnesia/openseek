import type { Command, CommandResult } from "../types.ts";

const session: Command = {
  name: "session",
  description: "Inspect current session state (model, mode, message count).",
  category: "session",
  isStub: false,
  async handle(ctx): Promise<CommandResult> {
    const s = ctx.session ?? {};
    const lines = [
      `model: ${s.model ?? "unset"}`,
      `mode: ${s.mode ?? "agent"}`,
      `effort: ${s.effort ?? "medium"}`,
      `messages: ${s.messages?.length ?? 0}`,
    ];
    return { kind: "text", payload: { text: lines.join("\n"), data: s } };
  },
};

export default session;
