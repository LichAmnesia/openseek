import { readFileSync } from "node:fs";
import { z } from "zod";
import type { Tool, ToolResult } from "../types.ts";
import { resolveWithinCwd } from "../workspace.ts";

const DEFAULT_LIMIT = 2000;
const MAX_LINE_LENGTH = 2000;

const inputSchema = z.object({
  path: z.string().min(1).describe("Path to read (relative to cwd or absolute within cwd)"),
  offset: z.number().int().min(0).optional().describe("Line offset (0-based)"),
  limit: z
    .number()
    .int()
    .min(1)
    .max(50000)
    .optional()
    .describe(`Max lines to return (default ${DEFAULT_LIMIT})`),
});

type ReadInput = z.infer<typeof inputSchema>;

const NOTEBOOK_RE = /\.ipynb$/i;

function readNotebook(content: string): string {
  const nb = JSON.parse(content) as {
    cells?: Array<{ cell_type?: string; source?: string | string[] }>;
  };
  const cells = nb.cells ?? [];
  const out: string[] = [];
  cells.forEach((cell, idx) => {
    const kind = cell.cell_type ?? "unknown";
    const src = Array.isArray(cell.source) ? cell.source.join("") : (cell.source ?? "");
    out.push(`# cell[${idx}] (${kind})`);
    out.push(src);
    out.push("");
  });
  return out.join("\n");
}

const read: Tool<typeof inputSchema> = {
  name: "read",
  description: "Read a text file, with optional offset/limit for paging large files.",
  inputSchema,
  permission: "auto",
  async call(input: ReadInput, ctx): Promise<ToolResult> {
    const { abs, relToCwd } = resolveWithinCwd(ctx.cwd, input.path);
    const file = Bun.file(abs);
    if (!(await file.exists())) {
      return { kind: "error", message: `file not found: ${relToCwd}` };
    }
    const raw = NOTEBOOK_RE.test(abs) ? readNotebook(readFileSync(abs, "utf8")) : await file.text();

    const lines = raw.split("\n");
    const offset = input.offset ?? 0;
    const limit = input.limit ?? DEFAULT_LIMIT;
    const slice = lines.slice(offset, offset + limit);

    const formatted = slice
      .map((line, i) => {
        const num = offset + i + 1;
        const truncated =
          line.length > MAX_LINE_LENGTH ? `${line.slice(0, MAX_LINE_LENGTH)}…` : line;
        return `${num.toString().padStart(6, " ")}\t${truncated}`;
      })
      .join("\n");

    const totalLines = lines.length;
    const shownEnd = Math.min(offset + slice.length, totalLines);
    const header = `# ${relToCwd} — lines ${offset + 1}-${shownEnd} of ${totalLines}`;
    return { kind: "text", text: `${header}\n${formatted}` };
  },
};

export default read;
