import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { z } from "zod";
import type { Tool, ToolResult } from "../types.ts";
import { resolveWithinCwd } from "../workspace.ts";

const inputSchema = z.object({
  path: z.string().min(1).describe("Destination file path (within cwd)"),
  content: z.string().describe("Full file contents to write"),
  force: z
    .boolean()
    .optional()
    .describe("If true, overwrite an existing file. Default false (refuse to overwrite)."),
});

type WriteInput = z.infer<typeof inputSchema>;

const write: Tool<typeof inputSchema> = {
  name: "write",
  description:
    "Write a new file. Refuses to overwrite an existing file unless force=true. Creates parent directories as needed.",
  inputSchema,
  permission: "deny-in-plan",
  async call(input: WriteInput, ctx): Promise<ToolResult> {
    const { abs, relToCwd } = resolveWithinCwd(ctx.cwd, input.path);
    const file = Bun.file(abs);
    const exists = await file.exists();
    if (exists && !input.force) {
      return {
        kind: "error",
        message: `refusing to overwrite ${relToCwd}; pass force=true to replace it`,
      };
    }
    const before = exists ? await file.text() : "";
    mkdirSync(dirname(abs), { recursive: true });
    await Bun.write(abs, input.content);
    return {
      kind: "diff",
      before,
      after: input.content,
      path: relToCwd,
    };
  },
};

export default write;
