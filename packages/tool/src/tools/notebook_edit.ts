import { z } from "zod";
import type { Tool, ToolResult } from "../types.ts";
import { resolveWithinCwd } from "../workspace.ts";

const inputSchema = z.object({
  path: z.string().min(1).describe("Path to a .ipynb notebook file."),
  cellIndex: z.number().int().min(0).describe("Zero-based cell index to edit."),
  newSource: z.string().describe("New cell source content (replaces the entire cell source)."),
  cellType: z
    .enum(["code", "markdown", "raw"])
    .optional()
    .describe("Optional new cell type. Default: keep existing type."),
});

type NotebookEditInput = z.infer<typeof inputSchema>;

interface Notebook {
  cells?: Array<{
    cell_type?: string;
    source?: string | string[];
    metadata?: Record<string, unknown>;
    outputs?: unknown[];
    execution_count?: number | null;
  }>;
  metadata?: Record<string, unknown>;
  nbformat?: number;
  nbformat_minor?: number;
}

const notebookEdit: Tool<typeof inputSchema> = {
  name: "notebook_edit",
  description:
    "Edit a single cell in a Jupyter .ipynb file by index. Replaces the cell source (and optionally the cell type).",
  inputSchema,
  permission: "deny-in-plan",
  async call(input: NotebookEditInput, ctx): Promise<ToolResult> {
    const { abs, relToCwd } = resolveWithinCwd(ctx.cwd, input.path);
    if (!abs.toLowerCase().endsWith(".ipynb")) {
      return { kind: "error", message: `not a .ipynb file: ${relToCwd}` };
    }
    const file = Bun.file(abs);
    if (!(await file.exists())) {
      return { kind: "error", message: `file not found: ${relToCwd}` };
    }
    const before = await file.text();
    let nb: Notebook;
    try {
      nb = JSON.parse(before) as Notebook;
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      return { kind: "error", message: `invalid notebook JSON: ${msg}` };
    }
    if (!Array.isArray(nb.cells)) {
      return { kind: "error", message: `notebook has no 'cells' array` };
    }
    if (input.cellIndex >= nb.cells.length) {
      return {
        kind: "error",
        message: `cellIndex ${input.cellIndex} out of range (notebook has ${nb.cells.length} cells)`,
      };
    }
    const cell = nb.cells[input.cellIndex];
    if (!cell) {
      return { kind: "error", message: `cell ${input.cellIndex} is missing` };
    }
    cell.source = input.newSource;
    if (input.cellType) {
      cell.cell_type = input.cellType;
      if (input.cellType !== "code") {
        // outputs/execution_count only meaningful for code cells
        delete cell.outputs;
        delete cell.execution_count;
      }
    }
    const after = `${JSON.stringify(nb, null, 2)}\n`;
    await Bun.write(abs, after);
    return { kind: "diff", before, after, path: relToCwd };
  },
};

export default notebookEdit;
