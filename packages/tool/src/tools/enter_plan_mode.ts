import { z } from "zod";
import type { Tool, ToolResult } from "../types.ts";

const inputSchema = z.object({
  reason: z
    .string()
    .min(1)
    .optional()
    .describe("Optional one-line explanation for why the agent is entering plan mode."),
});

type EnterPlanModeInput = z.infer<typeof inputSchema>;

const enterPlanMode: Tool<typeof inputSchema> = {
  name: "enter_plan_mode",
  description:
    "Signal a switch to Plan mode (read-only exploration, write tools refused). Returns an ack; the CLI/session layer applies the actual mode change.",
  inputSchema,
  permission: "auto",
  async call(input: EnterPlanModeInput, ctx): Promise<ToolResult> {
    ctx.log.info("enter_plan_mode", { reason: input.reason ?? null });
    const reasonNote = input.reason ? ` reason: ${input.reason}` : "";
    return {
      kind: "text",
      text: `[mode-signal] enter_plan_mode acknowledged.${reasonNote}`,
    };
  },
};

export default enterPlanMode;
