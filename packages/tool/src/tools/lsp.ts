import {
  createLspRouter,
  formatDiagnostics,
  type LspDiagnostic,
  type LspRouter,
} from "@openseek/lsp";
import { z } from "zod";
import type { Tool, ToolResult } from "../types.ts";

const inputSchema = z.object({
  op: z
    .enum(["definition", "references", "hover", "diagnostics", "rename"])
    .describe("LSP operation to perform.")
    .default("diagnostics"),
  file: z.string().min(1).describe("Workspace-relative file path."),
  line: z.number().int().min(0).optional().describe("Zero-based line number."),
  col: z.number().int().min(0).optional().describe("Zero-based column number."),
  newName: z
    .string()
    .min(1)
    .optional()
    .describe("Required for op='rename': the replacement symbol name."),
});

type LspInput = z.infer<typeof inputSchema>;

// Module-level injector so tests / session integration can swap in a mock
// router without rebuilding the registry. Defaults to the real tsc-backed
// router built lazily on first use.
let activeRouter: LspRouter | null = null;
export function setLspRouter(router: LspRouter | null): void {
  activeRouter = router;
}
export function getLspRouter(): LspRouter {
  if (!activeRouter) activeRouter = createLspRouter();
  return activeRouter;
}

const lsp: Tool<typeof inputSchema> = {
  name: "lsp",
  description:
    "Talk to the workspace's language servers. v0.3 ships op='diagnostics' (tsc-backed for .ts/.tsx/.js); hover / definition / references / rename remain stubbed for v0.4.",
  inputSchema,
  permission: "auto",
  async call(input: LspInput, ctx): Promise<ToolResult> {
    if (input.op === "diagnostics") {
      const router = getLspRouter();
      let diags: LspDiagnostic[] = [];
      try {
        diags = await router.probe(input.file);
      } catch (err) {
        ctx.log.warn("lsp probe threw — best-effort fallback", { err: String(err) });
        diags = [];
      }
      if (diags.length === 0) {
        return { kind: "text", text: `[lsp] no diagnostics for ${input.file}` };
      }
      return { kind: "text", text: formatDiagnostics(diags) };
    }

    // Stubs for hover / definition / references / rename — v0.4 work.
    if (input.op === "rename" && !input.newName) {
      return { kind: "error", message: "lsp rename requires newName" };
    }
    const pos =
      input.line !== undefined && input.col !== undefined
        ? `:${input.line}:${input.col}`
        : "";
    ctx.log.info("lsp [stub]", { op: input.op, file: input.file });
    const renameNote = input.op === "rename" ? ` newName=${input.newName}` : "";
    return {
      kind: "text",
      text: `[stub] [lsp ${input.op} at ${input.file}${pos}${renameNote} — not yet implemented (v0.4)]`,
    };
  },
};

export default lsp;
