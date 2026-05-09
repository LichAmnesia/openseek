import type { Command, CommandResult } from "../types.ts";

const plugin: Command = {
  name: "plugin",
  description: "List installed OpenSeek plugins (npm `openseek-plugin-*`).",
  category: "skills",
  isStub: false,
  async handle(ctx): Promise<CommandResult> {
    const list = (ctx.state?.plugins as Array<{ name: string; version: string }> | undefined) ?? [];
    if (list.length === 0) {
      return {
        kind: "text",
        payload: {
          text: "(no plugins loaded — v1.0 will populate from the plugin loader subsystem)",
          data: { count: 0, plugins: [] },
        },
      };
    }
    return {
      kind: "text",
      payload: {
        text: list.map((p) => `  - ${p.name}@${p.version}`).join("\n"),
        data: { count: list.length, plugins: list },
      },
    };
  },
};

export default plugin;
