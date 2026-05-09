import { z } from "zod";
import { resolveWithinCwd } from "../workspace.ts";
import type { Tool, ToolResult } from "../types.ts";

const inputSchema = z.object({
  path: z
    .string()
    .min(1)
    .describe("Workspace-relative path to an artifact (file/dir) the agent wants reviewed."),
  rubric: z
    .string()
    .min(1)
    .optional()
    .describe("Optional review rubric / criteria for the eventual reviewer agent."),
});

type ReviewArtifactInput = z.infer<typeof inputSchema>;

const reviewArtifact: Tool<typeof inputSchema> = {
  name: "review_artifact",
  description:
    "Queue an artifact (file, diff, run output) for review by a reviewer agent. v0.3 stub: validates the path and emits a marker; the real reviewer pipeline lands later.",
  inputSchema,
  permission: "auto",
  async call(input: ReviewArtifactInput, ctx): Promise<ToolResult> {
    let resolved: ReturnType<typeof resolveWithinCwd>;
    try {
      resolved = resolveWithinCwd(ctx.cwd, input.path);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      return { kind: "error", message: msg };
    }
    const rubric = input.rubric ? ` rubric='${input.rubric}'` : "";
    return {
      kind: "text",
      text: `[stub] [artifact ${resolved.relToCwd} reviewed${rubric}]`,
    };
  },
};

export default reviewArtifact;
