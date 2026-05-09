import { z } from "zod";
import type { AnyTool, Tool, ToolResult } from "../types.ts";

const inputSchema = z.object({
  query: z.string().min(1).describe("Substring to match against tool names and descriptions."),
  limit: z
    .number()
    .int()
    .min(1)
    .max(100)
    .optional()
    .describe("Maximum matches to return (default 20)."),
});

type ToolSearchInput = z.infer<typeof inputSchema>;

/**
 * Lazily resolve the default tool registry. Doing this at call-time (not
 * module init) avoids a circular import of `defaultRegistry` from `index.ts`.
 */
async function getDefaultTools(): Promise<AnyTool[]> {
  const mod = await import("../index.ts");
  return mod.builtinTools;
}

function score(tool: AnyTool, q: string): number {
  const name = tool.name.toLowerCase();
  if (name === q) return 100;
  if (name.startsWith(q)) return 80;
  if (name.includes(q)) return 60;
  if (tool.description.toLowerCase().includes(q)) return 30;
  return 0;
}

const toolSearch: Tool<typeof inputSchema> = {
  name: "tool_search",
  description:
    "Search the agent's tool registry for entries whose name or description matches a substring. Useful when the model can't recall the exact tool name.",
  inputSchema,
  permission: "auto",
  async call(input: ToolSearchInput, _ctx): Promise<ToolResult> {
    const q = input.query.toLowerCase().trim();
    const limit = input.limit ?? 20;
    const tools = await getDefaultTools();
    const ranked = tools
      .map((t) => ({ t, s: score(t, q) }))
      .filter((r) => r.s > 0)
      .sort((a, b) => b.s - a.s)
      .slice(0, limit);
    if (ranked.length === 0) {
      return { kind: "text", text: `[no tools match '${input.query}']` };
    }
    const lines = ranked.map(({ t }) => `  - ${t.name}: ${t.description.slice(0, 100)}`);
    return {
      kind: "text",
      text: `${ranked.length} match(es) for '${input.query}':\n${lines.join("\n")}`,
    };
  },
};

export default toolSearch;
