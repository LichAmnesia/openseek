import { z } from "zod";
import type { Tool, ToolResult } from "../types.ts";
import { ensureRelative } from "../workspace.ts";

const inputSchema = z.object({
  pattern: z
    .string()
    .min(1)
    .describe("Glob pattern (e.g. '**/*.ts'). Must be relative to cwd; absolute paths rejected."),
  limit: z
    .number()
    .int()
    .min(1)
    .max(10000)
    .optional()
    .describe("Max results to return (default 1000)."),
});

type GlobInput = z.infer<typeof inputSchema>;

const glob: Tool<typeof inputSchema> = {
  name: "glob",
  description:
    "List files in the workspace that match a glob pattern. Uses Bun.glob; pattern must be relative to cwd.",
  inputSchema,
  permission: "auto",
  async call(input: GlobInput, ctx): Promise<ToolResult> {
    ensureRelative(input.pattern);
    const limit = input.limit ?? 1000;
    const matcher = new Bun.Glob(input.pattern);
    const matches: string[] = [];
    for await (const entry of matcher.scan({ cwd: ctx.cwd, onlyFiles: true, dot: false })) {
      matches.push(entry);
      if (matches.length >= limit) break;
    }
    matches.sort();
    if (matches.length === 0) {
      return { kind: "text", text: `(no matches for ${input.pattern})` };
    }
    return { kind: "text", text: matches.join("\n") };
  },
};

export default glob;
