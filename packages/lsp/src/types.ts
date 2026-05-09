// Shared LSP types — surface used by tool + session integration.
// Design constraint: LSP probes are best-effort; never throw, never block.

export type LspSeverity = "error" | "warning" | "info";

export interface LspDiagnostic {
  /** Workspace-relative or absolute file path the diagnostic refers to. */
  file: string;
  /** 1-based line number (matches tsc output convention). */
  line: number;
  /** 1-based column number. */
  col: number;
  severity: LspSeverity;
  /** Human-readable message body. */
  message: string;
  /**
   * Optional source identifier — e.g. "tsc TS2304" or a future LSP server
   * name (rust-analyzer, pyright). Used for grouping in `formatDiagnostics`.
   */
  source?: string;
}

/**
 * Async probe over a single file. MUST resolve (never reject) — return an
 * empty array when the language server is unavailable, errors out, or the
 * file extension is unsupported.
 */
export type LspProbe = (filePath: string) => Promise<LspDiagnostic[]>;

/**
 * Router that dispatches a file path to the right probe based on extension.
 * Same best-effort contract: `probe` resolves to [] on unsupported / failed.
 */
export interface LspRouter {
  probe: LspProbe;
}
