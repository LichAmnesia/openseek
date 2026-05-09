import { z } from "zod";
import type { Tool, ToolResult } from "../types.ts";

const inputSchema = z.object({
  queries: z
    .array(z.string().min(1))
    .min(1)
    .max(16)
    .describe("Up to 16 parallel reasoning prompts dispatched to cheap-model workers."),
  model: z
    .string()
    .min(1)
    .optional()
    .describe("Override the worker model id (default: cheap reasoning model)."),
});

type RlmQueryInput = z.infer<typeof inputSchema>;

const MAX_RESPONSE_PREVIEW = 600;

function truncate(text: string, max: number): string {
  if (text.length <= max) return text;
  return `${text.slice(0, max - 1)}…`;
}

const rlmQuery: Tool<typeof inputSchema> = {
  name: "rlm_query",
  description:
    "RLM (Reflective Language Model) parallel sampler — fan out N prompts to a cheap reasoning model and aggregate results in input order. v0.3 ships a mock runner (deterministic stub responses); v0.5 wires a real cheap LLM client.",
  inputSchema,
  permission: "auto",
  async call(input: RlmQueryInput, ctx): Promise<ToolResult> {
    const { runRlm, mockRunner } = await import("@openseek/agent");
    const model = input.model ?? "(default-cheap)";
    ctx.log.info("rlm_query", { count: input.queries.length, model });
    const results = await runRlm(input.queries, {
      runner: mockRunner,
      signal: ctx.abort,
    });
    const lines = results.map(
      (r, i) => `[${i + 1}/${results.length}] ${truncate(r.response, MAX_RESPONSE_PREVIEW)}`,
    );
    const header = `[rlm: ${results.length} queries, model=${model}]`;
    return { kind: "text", text: `${header}\n${lines.join("\n")}` };
  },
};

export default rlmQuery;
