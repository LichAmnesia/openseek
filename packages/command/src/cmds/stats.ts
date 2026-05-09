import type { Command, CommandResult } from "../types.ts";

const stats: Command = {
  name: "stats",
  description: "Show counters: turns, tool calls, errors.",
  category: "auth",
  isStub: false,
  async handle(ctx): Promise<CommandResult> {
    const s = (ctx.state?.stats ?? { turns: 0, toolCalls: 0, errors: 0 }) as Record<
      string,
      number
    >;
    return {
      kind: "text",
      payload: {
        text: `stats — turns=${s.turns ?? 0} toolCalls=${s.toolCalls ?? 0} errors=${s.errors ?? 0}`,
        data: s,
      },
    };
  },
};

export default stats;
