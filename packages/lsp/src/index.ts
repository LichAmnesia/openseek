// @openseek/lsp — best-effort LSP probes for the session-loop edit/diagnose
// feedback (SPEC.md G3.4). v0.3 ships tsc only; rust-analyzer / pyright /
// gopls / clangd are reserved for v0.4.

export const PACKAGE_NAME = "@openseek/lsp";

export type { LspDiagnostic, LspProbe, LspRouter, LspSeverity } from "./types.ts";
export { tscProbe, type TscOpts } from "./tsc.ts";
export { createLspRouter, type LspRouterOpts } from "./router.ts";
export { formatDiagnostics } from "./format.ts";
