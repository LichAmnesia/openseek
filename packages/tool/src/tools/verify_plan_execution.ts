import { z } from "zod";
import type { Tool, ToolResult } from "../types.ts";

const inputSchema = z.object({
  steps: z
    .array(z.string().min(1))
    .min(1)
    .describe("Plan steps that should be cross-checked against actual transcript artifacts."),
});

type VerifyPlanExecutionInput = z.infer<typeof inputSchema>;

const verifyPlanExecution: Tool<typeof inputSchema> = {
  name: "verify_plan_execution",
  description:
    "Check that each plan step has a matching artifact in the run transcript. v0.3 stub: pretends every step verified; the real impl walks the run history and tool-call ledger.",
  inputSchema,
  permission: "auto",
  async call(input: VerifyPlanExecutionInput, ctx): Promise<ToolResult> {
    ctx.log.info("verify_plan_execution [stub]", { count: input.steps.length });
    const lines = input.steps.map((s, i) => `  [ok] step ${i + 1}: ${s}`);
    return {
      kind: "text",
      text: `[stub] all ${input.steps.length} step(s) verified\n${lines.join("\n")}`,
    };
  },
};

export default verifyPlanExecution;
