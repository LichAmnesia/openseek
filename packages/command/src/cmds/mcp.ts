import type { Command, CommandResult } from "../types.ts";

const mcp: Command = {
  name: "mcp",
  description: "List configured MCP servers / their status.",
  category: "skills",
  isStub: false,
  async handle(ctx): Promise<CommandResult> {
    const list = (ctx.state?.mcpServers as Array<{ name: string; status: string }> | undefined) ?? [];
    if (list.length === 0) {
      return {
        kind: "text",
        payload: {
          text: "(no MCP servers configured — v1.0 will populate from the MCP daemon subsystem)",
          data: { count: 0, servers: [] },
        },
      };
    }
    return {
      kind: "text",
      payload: {
        text: list.map((m) => `  - ${m.name} [${m.status}]`).join("\n"),
        data: { count: list.length, servers: list },
      },
    };
  },
};

export default mcp;
