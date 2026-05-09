import type { Command, CommandResult } from "../types.ts";

const THEMES = ["default", "dark", "light", "high-contrast"] as const;

const theme: Command = {
  name: "theme",
  description: "Get or set the TUI theme.",
  category: "config",
  isStub: false,
  async handle(ctx): Promise<CommandResult> {
    const next = ctx.args?.[0];
    if (!next) {
      return {
        kind: "text",
        payload: {
          text: `current: ${ctx.session?.theme ?? "default"}\nthemes: ${THEMES.join(", ")}`,
          data: { themes: THEMES },
        },
      };
    }
    if (!(THEMES as readonly string[]).includes(next)) {
      return { kind: "text", payload: { text: `unknown theme '${next}'` } };
    }
    if (ctx.session) ctx.session.theme = next;
    return {
      kind: "action",
      payload: { action: "set-theme", text: `theme → ${next}`, data: { theme: next } },
    };
  },
};

export default theme;
