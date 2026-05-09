// Format LspDiagnostic[] into a compact markdown note for system-message
// injection. Severity-sorted (error → warning → info) and capped per file
// to keep the prompt budget bounded.

import type { LspDiagnostic, LspSeverity } from "./types.ts";

const SEVERITY_RANK: Record<LspSeverity, number> = {
  error: 0,
  warning: 1,
  info: 2,
};

const SEVERITY_LABEL: Record<LspSeverity, string> = {
  error: "error",
  warning: "warn",
  info: "info",
};

function pluralize(n: number, word: string): string {
  return `${n} ${word}${n === 1 ? "" : "s"}`;
}

export function formatDiagnostics(diags: LspDiagnostic[], maxPerFile = 5): string {
  if (diags.length === 0) return "";

  const byFile = new Map<string, LspDiagnostic[]>();
  for (const d of diags) {
    const list = byFile.get(d.file) ?? [];
    list.push(d);
    byFile.set(d.file, list);
  }

  const sections: string[] = [];
  for (const [file, list] of byFile) {
    list.sort((a, b) => {
      const sevDiff = SEVERITY_RANK[a.severity] - SEVERITY_RANK[b.severity];
      if (sevDiff !== 0) return sevDiff;
      if (a.line !== b.line) return a.line - b.line;
      return a.col - b.col;
    });
    const shown = list.slice(0, maxPerFile);
    const truncated = list.length - shown.length;
    const header = `**LSP** (${pluralize(list.length, "issue")} in ${file}):`;
    const body = shown.map((d) => {
      const src = d.source ? ` ${d.source}` : "";
      return `  - L${d.line}:${d.col} ${SEVERITY_LABEL[d.severity]}${src}: ${d.message}`;
    });
    if (truncated > 0) {
      body.push(`  - …${truncated} more truncated`);
    }
    sections.push([header, ...body].join("\n"));
  }
  return sections.join("\n\n");
}
