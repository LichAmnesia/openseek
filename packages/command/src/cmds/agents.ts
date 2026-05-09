import type { Command, CommandResult } from "../types.ts";

// Pre-fix this command claimed 4 hard-coded sub-agent profiles ("general",
// "code", "research", "debug") that nothing in the agent package actually
// surfaces — @openseek/agent only exposes a single `spawnAgent`. The list
// was a UX lie. Now we read `ctx.state.agents` if a real registry has been
// wired in, otherwise we render an honest "no profiles registered yet"
// notice that points at the v1.0 milestone.
const agents: Command = {
  name: "agents",
  description: "List available sub-agent profiles.",
  category: "agent",
  isStub: false,
  async handle(ctx): Promise<CommandResult> {
    const list = ctx.state?.agents as string[] | undefined;
    if (Array.isArray(list) && list.length > 0) {
      return {
        kind: "text",
        payload: {
          text: `agents:\n${list.map((a) => `  - ${a}`).join("\n")}`,
          data: { list },
        },
      };
    }
    return {
      kind: "text",
      payload: {
        text: "agents:\n  (no sub-agents registered yet — v1.0 will populate from the agent registry subsystem)",
        data: { list: [] },
      },
    };
  },
};

export default agents;
