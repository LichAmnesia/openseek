import { estimateCost, formatCost } from "@openseek/provider";
import type { Command, CommandResult } from "../types.ts";

// Pre-fix this command read `ctx.state.usage.input` / `.output`, but the
// cli-host populates `commandState.usage` from `UsageDisplay` whose fields
// are `totalIn` / `totalOut` (cumulative across the session) — so /cost
// always reported $0 regardless of how many turns had run. We now consume
// the same shape the routing layer produces, and route through the real
// per-model `estimateCost()` instead of a hardcoded $3/$15 placeholder.
interface UsageShape {
  totalIn?: number;
  totalOut?: number;
  cacheRead?: number;
  cacheCreation?: number;
}

const cost: Command = {
  name: "cost",
  description: "Estimate USD cost so far based on accumulated token usage and the active model's pricing.",
  category: "auth",
  isStub: false,
  async handle(ctx): Promise<CommandResult> {
    const u = (ctx.state?.usage as UsageShape | undefined) ?? {};
    const modelId = ctx.session?.model;
    const totalIn = u.totalIn ?? 0;
    const totalOut = u.totalOut ?? 0;
    const cacheRead = u.cacheRead ?? 0;
    const cacheCreation = u.cacheCreation ?? 0;

    if (totalIn === 0 && totalOut === 0) {
      return {
        kind: "text",
        payload: { text: "cost: $0.00 (no tokens consumed yet)", data: { usd: 0 } },
      };
    }
    if (!modelId) {
      return {
        kind: "text",
        payload: {
          text: "cost: cannot estimate without a model id (session not initialised yet).",
          data: { usd: 0 },
        },
      };
    }
    const usd = estimateCost({ totalIn, totalOut, cacheRead, cacheCreation }, modelId);
    return {
      kind: "text",
      payload: {
        text: `cost (model=${modelId}): ${formatCost(usd)}  ·  in=${totalIn} out=${totalOut} cacheRead=${cacheRead} cacheWrite=${cacheCreation}`,
        data: { usd, model: modelId, usage: { totalIn, totalOut, cacheRead, cacheCreation } },
      },
    };
  },
};

export default cost;
