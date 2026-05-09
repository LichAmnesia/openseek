import { z } from "zod";
import type { Tool, ToolResult } from "../types.ts";

const inputSchema = z.object({
  content: z.string().describe("Text to echo verbatim back to the run as a tool result."),
});

type SyntheticOutputInput = z.infer<typeof inputSchema>;

const syntheticOutput: Tool<typeof inputSchema> = {
  name: "synthetic_output",
  description:
    "Echo a literal string back as a tool result. Useful in tests / debugging when you need a deterministic tool reply, or to inject a planned scratchpad note into the transcript.",
  inputSchema,
  permission: "auto",
  async call(input: SyntheticOutputInput, _ctx): Promise<ToolResult> {
    return { kind: "text", text: input.content };
  },
};

export default syntheticOutput;
