import type { Command, CommandResult } from "../types.ts";

const MODES = ["auto", "always", "never"] as const;

const color: Command = {
  name: "color",
  description: "Set ANSI color mode (auto / always / never).",
  category: "config",
  isStub: false,
  async handle(ctx): Promise<CommandResult> {
    const next = ctx.args?.[0] ?? "auto";
    if (!(MODES as readonly string[]).includes(next)) {
      return {
        kind: "text",
        payload: { text: `bad mode '${next}'. valid: ${MODES.join(", ")}` },
      };
    }
    return {
      kind: "action",
      payload: { action: "set-color", text: `color → ${next}`, data: { color: next } },
    };
  },
};

export default color;
