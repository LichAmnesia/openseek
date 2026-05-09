// tsc-based LSP probe — spawns `bun x tsc --noEmit --pretty false <file>`
// and parses the diagnostic lines into LspDiagnostic[].
//
// Best-effort: any spawn failure / unexpected stderr → return [].
// We don't try to discover the project's tsconfig — running tsc on a single
// file gives us syntactic + nominal type errors which is enough for the
// "edit → diagnose → inject" loop. Project-aware checking is v0.4.

import type { LspDiagnostic, LspSeverity } from "./types.ts";

// `path:line:col - error TS<n>: <msg>` (pretty=false form). Path may be
// absolute or relative; line/col are 1-based.
const TSC_LINE = /^(.+?)\((\d+),(\d+)\):\s+(error|warning|info)\s+TS(\d+):\s+(.+)$/;
// Some tsc versions emit `path:line:col - error TSnnn: msg` with colons:
const TSC_LINE_COLON = /^(.+?):(\d+):(\d+)\s+-\s+(error|warning|info)\s+TS(\d+):\s+(.+)$/;

export interface TscOpts {
  /** Working directory for the spawn. Default: dirname(filePath). */
  rootDir?: string;
}

function parseTscOutput(stdout: string, stderr: string): LspDiagnostic[] {
  const out: LspDiagnostic[] = [];
  for (const raw of `${stdout}\n${stderr}`.split("\n")) {
    const line = raw.trim();
    if (!line) continue;
    const m = TSC_LINE.exec(line) ?? TSC_LINE_COLON.exec(line);
    if (!m) continue;
    const [, file, ln, col, sev, code, msg] = m;
    if (!file || !ln || !col || !sev || !code || !msg) continue;
    out.push({
      file,
      line: Number.parseInt(ln, 10),
      col: Number.parseInt(col, 10),
      severity: sev as LspSeverity,
      message: msg,
      source: `tsc TS${code}`,
    });
  }
  return out;
}

export async function tscProbe(filePath: string, opts: TscOpts = {}): Promise<LspDiagnostic[]> {
  try {
    // biome-ignore lint/suspicious/noExplicitAny: Bun typings vary across versions.
    const Bun = (globalThis as any).Bun;
    if (!Bun?.spawn) return [];
    const proc = Bun.spawn(["bun", "x", "tsc", "--noEmit", "--pretty", "false", filePath], {
      cwd: opts.rootDir,
      stdout: "pipe",
      stderr: "pipe",
    });
    const [stdout, stderr] = await Promise.all([
      new Response(proc.stdout).text(),
      new Response(proc.stderr).text(),
    ]);
    await proc.exited;
    return parseTscOutput(stdout, stderr);
  } catch {
    return [];
  }
}

// Exported for tests so we can exercise the parser directly without spawning tsc.
export const _internal = { parseTscOutput };
