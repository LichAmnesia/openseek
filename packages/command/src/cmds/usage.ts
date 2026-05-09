import type { Command, CommandResult } from "../types.ts";

// Pre-fix this command read `u.input` / `u.output` / `u.cacheRead`, but
// the cli-host populates `commandState.usage` from `UsageDisplay`
// (`totalIn` / `totalOut` / `cacheCreation` / `cacheRead`). All four
// counters silently rendered as 0. The shape now matches the producer.
interface UsageShape {
  totalIn?: number;
  totalOut?: number;
  cacheRead?: number;
  cacheCreation?: number;
}

const usage: Command = {
  name: "usage",
  description: "Show token / request usage for the current session.",
  category: "auth",
  isStub: false,
  async handle(ctx): Promise<CommandResult> {
    const u = (ctx.state?.usage as UsageShape | undefined) ?? {};
    const totalIn = u.totalIn ?? 0;
    const totalOut = u.totalOut ?? 0;
    const cacheRead = u.cacheRead ?? 0;
    const cacheCreation = u.cacheCreation ?? 0;
    if (totalIn === 0 && totalOut === 0 && cacheRead === 0 && cacheCreation === 0) {
      return {
        kind: "text",
        payload: { text: "usage: no tokens consumed yet.", data: { totalIn, totalOut, cacheRead, cacheCreation } },
      };
    }
    return {
      kind: "text",
      payload: {
        text: `usage — input=${totalIn} output=${totalOut} cacheRead=${cacheRead} cacheWrite=${cacheCreation}`,
        data: { totalIn, totalOut, cacheRead, cacheCreation },
      },
    };
  },
};

export default usage;
