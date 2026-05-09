import type { Command, CommandResult } from "../types.ts";

const ORDER = ["low", "medium", "high"] as const;
type Effort = (typeof ORDER)[number];

const effort: Command = {
  name: "effort",
  description: "Cycle reasoning effort: low → medium → high.",
  category: "config",
  isStub: false,
  async handle(ctx): Promise<CommandResult> {
    const explicit = ctx.args?.[0];
    let next: Effort;
    if (explicit && (ORDER as readonly string[]).includes(explicit)) {
      next = explicit as Effort;
    } else {
      const cur = ctx.session?.effort ?? "medium";
      const idx = ORDER.indexOf(cur);
      next = ORDER[(idx + 1) % ORDER.length] as Effort;
    }
    if (ctx.session) ctx.session.effort = next;
    return {
      kind: "action",
      payload: { action: "set-effort", text: `effort → ${next}`, data: { effort: next } },
    };
  },
};

export default effort;
