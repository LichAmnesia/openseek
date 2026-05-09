import { z } from "zod";
import type { Tool, ToolResult } from "../types.ts";
import { resolveWithinCwd } from "../workspace.ts";

const inputSchema = z.object({
  path: z.string().min(1).describe("File to edit (within cwd)"),
  old_string: z.string().min(1).describe("Exact text to replace; must occur exactly once."),
  new_string: z.string().describe("Replacement text."),
});

type EditInput = z.infer<typeof inputSchema>;

function countOccurrences(haystack: string, needle: string): number {
  if (needle.length === 0) return 0;
  let count = 0;
  let idx = haystack.indexOf(needle);
  while (idx !== -1) {
    count += 1;
    idx = haystack.indexOf(needle, idx + needle.length);
  }
  return count;
}

const edit: Tool<typeof inputSchema> = {
  name: "edit",
  description:
    "Exact-string replace inside a file. Errors out if old_string is not found, or if it appears more than once (ambiguous).",
  inputSchema,
  permission: "deny-in-plan",
  async call(input: EditInput, ctx): Promise<ToolResult> {
    const { abs, relToCwd } = resolveWithinCwd(ctx.cwd, input.path);
    const file = Bun.file(abs);
    if (!(await file.exists())) {
      return { kind: "error", message: `file not found: ${relToCwd}` };
    }
    if (input.old_string === input.new_string) {
      return { kind: "error", message: "old_string and new_string are identical; nothing to do" };
    }
    const before = await file.text();
    const occurrences = countOccurrences(before, input.old_string);
    if (occurrences === 0) {
      return { kind: "error", message: `old_string not found in ${relToCwd}` };
    }
    if (occurrences > 1) {
      return {
        kind: "error",
        message: `old_string occurs ${occurrences} times in ${relToCwd}; provide more context to make it unique`,
      };
    }
    const after =
      before.slice(0, before.indexOf(input.old_string)) +
      input.new_string +
      before.slice(before.indexOf(input.old_string) + input.old_string.length);
    await Bun.write(abs, after);
    return { kind: "diff", before, after, path: relToCwd };
  },
};

export default edit;
