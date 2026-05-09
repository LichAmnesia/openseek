import type { Command, CommandResult } from "../types.ts";

const config: Command = {
  name: "config",
  description: "Display current effective config (model / mode / theme).",
  category: "config",
  isStub: false,
  async handle(ctx): Promise<CommandResult> {
    const s = ctx.session ?? {};
    const lines = [
      `model:        ${s.model ?? "unset"}`,
      `mode:         ${s.mode ?? "agent"}`,
      `effort:       ${s.effort ?? "medium"}`,
      `theme:        ${s.theme ?? "default"}`,
      `outputStyle:  ${s.outputStyle ?? "default"}`,
      `vim:          ${s.vimEnabled ? "on" : "off"}`,
    ];
    return { kind: "text", payload: { text: lines.join("\n"), data: s } };
  },
};

export default config;
