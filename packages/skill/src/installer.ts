// Skill installer — pulls a tarball from GitHub into ~/.openseek/skills/.
// We avoid embedding gh as a hard dep: callers can override `spawn` for
// tests. The default impl uses Bun.spawn against `gh api ... | tar -xz`.

import { join } from "node:path";
import { homedir } from "node:os";
import { existsSync, mkdirSync, mkdtempSync, rmSync } from "node:fs";
import type { InstallResult } from "./types.ts";

export type SpawnFn = (
  cmd: string[],
  opts?: { cwd?: string; stdin?: ArrayBuffer | Uint8Array | null },
) => Promise<{ stdout: Uint8Array; stderr: string; exitCode: number }>;

export interface InstallOptions {
  /** Where to install (default: ~/.openseek/skills). */
  target?: string;
  /** Spawn override for tests. */
  spawn?: SpawnFn;
  /** Temp dir override for tests. */
  tmpDir?: string;
}

const SPEC_RE = /^([A-Za-z0-9_.-]+)\/([A-Za-z0-9_.-]+)$/;

export async function installFromGithub(
  spec: string,
  opts: InstallOptions = {},
): Promise<InstallResult> {
  const m = SPEC_RE.exec(spec);
  if (!m) {
    return { ok: false, spec, message: `bad spec '${spec}'; want '<owner>/<repo>'` };
  }
  const owner = m[1] as string;
  const repo = m[2] as string;
  const target = opts.target ?? join(homedir(), ".openseek", "skills");
  mkdirSync(target, { recursive: true });
  const dest = join(target, `${owner}-${repo}`);
  if (existsSync(dest)) {
    return { ok: true, spec, installedAt: dest, message: `already installed at ${dest}` };
  }
  const spawn = opts.spawn ?? defaultSpawn;
  const tmpRoot = opts.tmpDir ?? target;
  const staging = mkdtempSync(join(tmpRoot, ".staging-"));
  try {
    const fetched = await spawn([
      "gh",
      "api",
      `repos/${owner}/${repo}/tarball/HEAD`,
      "-H",
      "Accept: application/vnd.github.tar",
    ]);
    if (fetched.exitCode !== 0) {
      return {
        ok: false,
        spec,
        message: `gh api failed (exit ${fetched.exitCode}): ${fetched.stderr.trim() || "no stderr"}`,
      };
    }
    if (fetched.stdout.byteLength === 0) {
      return { ok: false, spec, message: "gh returned empty tarball" };
    }
    const extracted = await spawn(["tar", "-xz", "-C", staging, "--strip-components=1"], {
      stdin: fetched.stdout,
    });
    if (extracted.exitCode !== 0) {
      return {
        ok: false,
        spec,
        message: `tar -xz failed: ${extracted.stderr.trim() || "no stderr"}`,
      };
    }
    // Move staging → dest atomically.
    const fs = await import("node:fs/promises");
    await fs.rename(staging, dest);
    return { ok: true, spec, installedAt: dest, message: `installed ${spec} → ${dest}` };
  } catch (err) {
    return { ok: false, spec, message: errMsg(err) };
  } finally {
    if (existsSync(staging)) rmSync(staging, { recursive: true, force: true });
  }
}

const defaultSpawn: SpawnFn = async (cmd, opts) => {
  const proc = Bun.spawn(cmd, {
    cwd: opts?.cwd,
    stdin: opts?.stdin ? new Response(opts.stdin).body : "ignore",
    stdout: "pipe",
    stderr: "pipe",
  });
  const [stdout, stderr] = await Promise.all([
    new Response(proc.stdout).bytes(),
    new Response(proc.stderr).text(),
  ]);
  const exitCode = await proc.exited;
  return { stdout, stderr, exitCode };
};

function errMsg(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}
