import { z } from "zod";
import type { Tool, ToolResult } from "../types.ts";

const inputSchema = z.object({
  title: z.string().min(1).max(200).describe("Short PR title in conventional-commit form."),
  body: z.string().min(1).describe("PR body / summary."),
  branch: z
    .string()
    .min(1)
    .optional()
    .describe("Optional branch name; defaults to the current branch."),
});

type SuggestBackgroundPrInput = z.infer<typeof inputSchema>;

const suggestBackgroundPr: Tool<typeof inputSchema> = {
  name: "suggest_background_pr",
  description:
    "Propose a background pull request based on the current diff. v0.3 stub: prints the proposal; the real impl forks a `gh pr create` flow into a sub-agent.",
  inputSchema,
  permission: "auto",
  async call(input: SuggestBackgroundPrInput, ctx): Promise<ToolResult> {
    ctx.log.info("suggest_background_pr [stub]", {
      title: input.title,
      branch: input.branch,
    });
    const branch = input.branch ?? "(current branch)";
    return {
      kind: "text",
      text: [
        `[stub] [background PR not yet implemented]`,
        `  title:  ${input.title}`,
        `  branch: ${branch}`,
        `  body:   ${input.body.split("\n")[0]}…`,
      ].join("\n"),
    };
  },
};

export default suggestBackgroundPr;
