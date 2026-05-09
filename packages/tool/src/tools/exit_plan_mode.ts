import { z } from "zod";
import type { Tool, ToolResult } from "../types.ts";

const inputSchema = z.object({
  summary: z
    .string()
    .min(1)
    .optional()
    .describe("Optional summary of the plan produced before exiting plan mode."),
});

type ExitPlanModeInput = z.infer<typeof inputSchema>;

const exitPlanMode: Tool<typeof inputSchema> = {
  name: "exit_plan_mode",
  description:
    "Signal a switch from Plan mode back to Agent mode (writes re-enabled). Returns an ack; the CLI/session layer applies the actual mode change.",
  inputSchema,
  permission: "auto",
  async call(input: ExitPlanModeInput, ctx): Promise<ToolResult> {
    ctx.log.info("exit_plan_mode", { hasSummary: Boolean(input.summary) });
    const tail = input.summary ? `\n${input.summary}` : "";
    return {
      kind: "text",
      text: `[mode-signal] exit_plan_mode acknowledged.${tail}`,
    };
  },
};

export default exitPlanMode;
