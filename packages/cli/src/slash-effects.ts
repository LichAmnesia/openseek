// Side-effect helpers for slash commands wired in interactive.ts.
//
// Kept here (not in interactive.ts) so the interactive runtime stays under
// its 500-LOC budget and so each helper is unit-testable in isolation.
//
//   * applyColorMode      → T2 /color: flip NO_COLOR / FORCE_COLOR env vars
//   * appendDebugLogLine  → T3 /debug: append a JSON line to ~/.openseek/debug.log
//   * installSkillFromSpec → T4 /skills install: git clone into .openseek/skills/
//
// All three are intentionally synchronous-friendly (no I/O on the hot path
// when the feature is OFF) — appendDebugLogLine returns immediately when
// the supplied predicate says debug is disabled.

import { mkdirSync, existsSync, appendFileSync } from "node:fs";
import { dirname, basename, join } from "node:path";
import { homedir } from "node:os";

export type ColorMode = "auto" | "always" | "never";

/**
 * T2 — /color. Flip NO_COLOR / FORCE_COLOR env vars on `process.env`.
 *
 *   never  → NO_COLOR=1     + remove FORCE_COLOR
 *   always → FORCE_COLOR=1  + remove NO_COLOR
 *   auto   → remove both
 *
 * Mutating process.env IS the side-effect; the convention is honored by
 * downstream child processes (git, rg, fmt, etc.) and most node libs.
 */
export function applyColorMode(mode: ColorMode, env: NodeJS.ProcessEnv = process.env): void {
  if (mode === "never") {
    env.NO_COLOR = "1";
    delete env.FORCE_COLOR;
    return;
  }
  if (mode === "always") {
    env.FORCE_COLOR = "1";
    delete env.NO_COLOR;
    return;
  }
  delete env.NO_COLOR;
  delete env.FORCE_COLOR;
}

export interface DebugLogEntry {
  ts: string;
  type: string;
  data?: unknown;
}

/**
 * T3 — /debug. Append one JSON line to <home>/.openseek/debug.log when
 * the predicate `enabled()` returns true.
 *
 *   * No-op if debug is currently OFF (cheap fast-path on every event).
 *   * Creates ~/.openseek/ on demand.
 *   * Failures are swallowed (best-effort logging — must not crash the TUI).
 *
 * `homeOverride` exists so the test harness can point HOME at a tmpdir.
 */
export function appendDebugLogLine(
  entry: DebugLogEntry,
  enabled: () => boolean,
  homeOverride?: string,
): void {
  if (!enabled()) return;
  const home = homeOverride ?? homedir();
  const path = join(home, ".openseek", "debug.log");
  try {
    mkdirSync(dirname(path), { recursive: true });
    appendFileSync(path, `${JSON.stringify(entry)}\n`, "utf8");
  } catch {
    // best-effort
  }
}

export interface InstallSkillDeps {
  cwd: string;
  spawn: (
    cmd: string[],
    opts?: { cwd?: string },
  ) => Promise<{ stdout: string; stderr: string; exitCode: number }>;
  appendRow: (text: string) => void;
  /** Test seam — defaults to fs.existsSync. */
  fileExists?: (p: string) => boolean;
}

/**
 * T4 — /skills install <spec>. Real git clone, no stub.
 *
 *   * Resolves spec → target dir = `<cwd>/.openseek/skills/<basename>`.
 *     - "owner/repo"           → basename "repo"
 *     - "git@host:foo/bar.git" → basename "bar"
 *     - "https://x/y.git"      → basename "y"
 *   * Ensures the parent dir exists.
 *   * Spawns `git clone <spec> <target>`.
 *   * Validates the resulting `<target>/SKILL.md` is present.
 *   * Surfaces a single system row (success or failure).
 */
export async function installSkillFromSpec(spec: string, deps: InstallSkillDeps): Promise<void> {
  const targetName = deriveSkillName(spec);
  if (!targetName) {
    deps.appendRow(`install-skill: cannot derive a skill name from spec "${spec}"`);
    return;
  }
  const skillsDir = join(deps.cwd, ".openseek", "skills");
  const target = join(skillsDir, targetName);
  try {
    mkdirSync(skillsDir, { recursive: true });
  } catch (err) {
    deps.appendRow(
      `install-skill: cannot create skills dir at ${skillsDir} — ${err instanceof Error ? err.message : String(err)}`,
    );
    return;
  }
  const cloneArg = normalizeCloneSpec(spec);
  const res = await deps.spawn(["git", "clone", cloneArg, target]);
  if (res.exitCode !== 0) {
    const err = res.stderr.trim() || res.stdout.trim() || `exit ${res.exitCode}`;
    deps.appendRow(`install-skill: git clone failed for ${spec} — ${err}`);
    return;
  }
  const exists = (deps.fileExists ?? existsSync)(join(target, "SKILL.md"));
  if (!exists) {
    deps.appendRow(
      `install-skill: cloned ${targetName} but no SKILL.md found — keeping the directory but skill is not loadable`,
    );
    return;
  }
  deps.appendRow(`install-skill: installed ${targetName} → ${target}`);
}

/** Strip `.git` and any trailing slash, then take the basename. */
export function deriveSkillName(spec: string): string {
  const trimmed = spec.replace(/\/+$/, "").replace(/\.git$/, "");
  const last = basename(trimmed);
  return last;
}

/**
 * Pass through anything that already looks like a clone URL (contains a
 * scheme or `:` or `/`); otherwise treat as `owner/repo` shorthand and
 * point it at github.com over HTTPS.
 */
export function normalizeCloneSpec(spec: string): string {
  if (/^[\w]+:\/\//.test(spec) || spec.startsWith("git@")) return spec;
  if (/^[^/]+\/[^/]+$/.test(spec)) return `https://github.com/${spec}.git`;
  return spec;
}
