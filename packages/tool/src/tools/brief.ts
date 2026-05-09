import { z } from "zod";
import type { Tool, ToolResult } from "../types.ts";

const inputSchema = z.object({
  format: z
    .enum(["markdown", "json", "plain"])
    .optional()
    .describe("Output format the brief generator should target (default markdown)."),
  topic: z
    .string()
    .min(1)
    .optional()
    .describe("Optional focus topic; default summarises the full session."),
});

type BriefInput = z.infer<typeof inputSchema>;

const brief: Tool<typeof inputSchema> = {
  name: "brief",
  description:
    "Produce an end-of-run brief summarising the agent's actions and findings. v0.3 stub: returns a not-yet-implemented marker; the real impl will read SessionMemory.",
  inputSchema,
  permission: "auto",
  async call(input: BriefInput, ctx): Promise<ToolResult> {
    const format = input.format ?? "markdown";
    ctx.log.info("brief [stub]", { format, topic: input.topic });
    const topicNote = input.topic ? ` topic=${input.topic}` : "";
    return {
      kind: "text",
      text: `[stub] [brief generation not yet implemented (format=${format}${topicNote})]`,
    };
  },
};

export default brief;
