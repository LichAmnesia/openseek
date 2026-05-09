import { z } from "zod";
import type { Tool, ToolResult } from "../types.ts";

const inputSchema = z.object({
  name: z.string().min(1).describe("Workflow identifier (e.g. 'release-cut', 'nightly-eval')."),
  steps: z
    .array(z.string().min(1))
    .min(1)
    .describe("Ordered list of step descriptions. Each step is plain natural language."),
});

type WorkflowInput = z.infer<typeof inputSchema>;

const workflow: Tool<typeof inputSchema> = {
  name: "workflow",
  description:
    "Declare a multi-step workflow so the planner can coordinate it. v0.3 stub: stores nothing, just acks. Future versions persist the plan and progress.",
  inputSchema,
  permission: "auto",
  async call(input: WorkflowInput, ctx): Promise<ToolResult> {
    ctx.log.info("workflow [stub]", { name: input.name, steps: input.steps.length });
    return {
      kind: "text",
      text: `[stub] [workflow '${input.name}' registered with ${input.steps.length} step(s)]`,
    };
  },
};

export default workflow;
