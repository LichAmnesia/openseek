import type { Command, CommandResult } from "../types.ts";

const copy: Command = {
  name: "copy",
  description: "Copy the last assistant message to clipboard (action delegates to harness).",
  category: "session",
  isStub: false,
  async handle(ctx): Promise<CommandResult> {
    const last = ctx.session?.messages?.at(-1);
    return {
      kind: "action",
      payload: {
        action: "copy-last",
        text: last ? "copying last assistant message…" : "no messages to copy.",
        data: { hasMessage: Boolean(last) },
      },
    };
  },
};

export default copy;
