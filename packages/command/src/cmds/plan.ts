import type { Command, CommandResult } from "../types.ts";

const plan: Command = {
  name: "plan",
  description: "Enter plan mode (read-only tools, no edits/exec).",
  category: "agent",
  isStub: false,
  async handle(ctx): Promise<CommandResult> {
    if (ctx.session) ctx.session.mode = "plan";
    return {
      kind: "action",
      payload: { action: "enter-plan-mode", text: "entered plan mode.", data: { mode: "plan" } },
    };
  },
};

export default plan;
