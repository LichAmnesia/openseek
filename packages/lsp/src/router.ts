// Extension-based LSP router. v0.3 only wires tsc; other languages are
// reserved (.py / .go / .rs / .c / .cpp) and resolve to [] until v0.4.

import { tscProbe } from "./tsc.ts";
import type { LspDiagnostic, LspProbe, LspRouter } from "./types.ts";

const TS_EXTS = new Set([".ts", ".tsx", ".js", ".jsx", ".mjs", ".cjs"]);

// Reserved for v0.4 (pyright / gopls / rust-analyzer / clangd). Listed so
// tests can verify the router knowingly returns [] rather than treating
// these as "unknown".
const RESERVED_EXTS = new Set([".py", ".go", ".rs", ".c", ".h", ".cpp", ".cc", ".hpp"]);

function extOf(filePath: string): string {
  const slash = filePath.lastIndexOf("/");
  const base = slash >= 0 ? filePath.slice(slash + 1) : filePath;
  const dot = base.lastIndexOf(".");
  if (dot <= 0) return "";
  return base.slice(dot).toLowerCase();
}

export interface LspRouterOpts {
  /** Override the default tsc probe — primarily for tests / DI. */
  tsc?: LspProbe;
}

export function createLspRouter(opts: LspRouterOpts = {}): LspRouter {
  const tsc = opts.tsc ?? tscProbe;
  return {
    async probe(filePath: string): Promise<LspDiagnostic[]> {
      const ext = extOf(filePath);
      if (TS_EXTS.has(ext)) {
        try {
          return await tsc(filePath);
        } catch {
          return [];
        }
      }
      // Reserved extensions + unknown extensions both resolve to [].
      // We keep the branches separate so future v0.4 work can plug
      // pyright / gopls / etc. in by extension family.
      if (RESERVED_EXTS.has(ext)) return [];
      return [];
    },
  };
}
