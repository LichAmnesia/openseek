// Persist user-level config to ~/.openseek/config.toml.
//
// Mirrors `loadConfig`'s file location and TOML key shape (`provider`,
// `model`, `api_key`, `base_url`). When the file already exists we read +
// merge so unrelated keys (future fields) are not clobbered.
//
// File mode is forced to 0600 (owner-only) since the file holds an API key,
// even when overwriting an existing file with looser perms. The directory
// is forced to 0700.
//
// Writes are atomic: we stage to a sibling temp file, fsync, then rename
// onto the target. Concurrent saves are last-writer-wins per rename(2)
// ordering, but a half-written file is never observable to readers.

import * as TOML from "@iarna/toml";
import { homedir } from "node:os";
import { basename, dirname, join } from "node:path";

export interface SaveUserConfigValues {
  provider?: string;
  model?: string;
  apiKey?: string;
  /** string sets/updates base_url; null removes a stale base_url. */
  baseURL?: string | null;
}

export interface SaveUserConfigIO {
  /** Override $HOME (tests). */
  home?: string;
  /**
   * Override file write (tests). Receives path + contents + mode.
   *
   * NOTE: when this override is supplied, the production atomic-rename +
   * chmod path is bypassed (tests usually don't have a real fs anyway).
   * The default implementation does atomic temp-file-then-rename and
   * force-tightens the file mode to 0600 after the rename.
   */
  writeFile?: (path: string, contents: string, mode: number) => void;
  /**
   * Override mkdir (tests). Should be idempotent (mkdir -p semantics).
   *
   * Default implementation also chmods the directory to 0700 after creation
   * so a pre-existing looser-perms directory gets tightened.
   */
  mkdir?: (path: string) => void;
  /** Override read (tests). Returns undefined when file is missing. */
  readFile?: (path: string) => string | undefined;
  /** Override existsSync (tests). */
  exists?: (path: string) => boolean;
}

const FILE_MODE = 0o600;
const DIR_MODE = 0o700;

/**
 * Write `values` to ~/.openseek/config.toml with mkdir -p + 0600 perms.
 * Existing keys are read first and merged so we don't drop forward-compat
 * fields. Returns the path written.
 */
export function saveUserConfig(
  values: SaveUserConfigValues,
  ioOverride?: SaveUserConfigIO,
): string {
  const io = resolveIO(ioOverride);
  const dir = join(io.home, ".openseek");
  const path = join(dir, "config.toml");

  io.mkdir(dir);

  const existingRaw = io.readFile(path);
  const existing = parseExisting(existingRaw);

  const merged: Record<string, unknown> = { ...existing };
  if (values.provider !== undefined) merged.provider = values.provider;
  if (values.model !== undefined) merged.model = values.model;
  if (values.apiKey !== undefined) merged.api_key = values.apiKey;
  if (values.baseURL === null) delete merged.base_url;
  else if (values.baseURL !== undefined) merged.base_url = values.baseURL;

  // @iarna/toml's stringify type signature is JsonMap; a plain
  // Record<string,string> satisfies it at runtime.
  const out = TOML.stringify(merged as Parameters<typeof TOML.stringify>[0]);
  io.writeFile(path, out, FILE_MODE);
  return path;
}

function parseExisting(raw: string | undefined): Record<string, unknown> {
  if (!raw) return {};
  try {
    return TOML.parse(raw) as Record<string, unknown>;
  } catch {
    // Malformed file — caller intent is "save these values"; we drop the
    // unparseable content rather than throw, matching loadConfig behaviour.
    return {};
  }
}

interface ResolvedIO {
  home: string;
  writeFile: (path: string, contents: string, mode: number) => void;
  mkdir: (path: string) => void;
  readFile: (path: string) => string | undefined;
  exists: (path: string) => boolean;
}

function resolveIO(io?: SaveUserConfigIO): ResolvedIO {
  const fs = require("node:fs") as typeof import("node:fs");
  return {
    home: io?.home ?? homedir(),
    writeFile: io?.writeFile ?? defaultAtomicWrite(fs),
    mkdir:
      io?.mkdir ??
      ((p) => {
        fs.mkdirSync(p, { recursive: true, mode: DIR_MODE });
        // mkdirSync's `mode` is honored only at creation. Force-tighten so
        // a pre-existing 0o755 dir gets locked down to 0o700. (F1.4)
        try {
          fs.chmodSync(p, DIR_MODE);
        } catch {
          // best-effort: chmod may fail on non-POSIX or read-only fs.
        }
      }),
    readFile:
      io?.readFile ??
      ((p) => {
        try {
          if (!fs.existsSync(p)) return undefined;
          return fs.readFileSync(p, "utf8");
        } catch {
          return undefined;
        }
      }),
    exists:
      io?.exists ??
      ((p) => {
        try {
          return fs.existsSync(p);
        } catch {
          return false;
        }
      }),
  };
}

/**
 * Atomic write helper (F1.3 + F1.4 + F5 P0-GAP #4):
 *   1. Stage contents to `.<basename>.tmp.<pid>.<ts>` next to the target.
 *   2. fsync the temp fd to push bytes to disk before rename.
 *   3. rename(tmp, target) — atomic on POSIX; the destination is replaced
 *      with the temp file's inode (and thus its 0o600 mode).
 *   4. chmod the final target to 0o600 anyway so we don't depend on which
 *      inode metadata wins on exotic filesystems.
 *   5. F5 P0-GAP #4: fsync the parent directory inode so the rename
 *      survives a hard crash. Without this, the rename(2) is durable on
 *      the inode level but the parent directory's directory-entry update
 *      can still be lost if the box loses power before the next dir
 *      flush. Best-effort — some filesystems / platforms don't support
 *      directory fsync (Windows in particular).
 *
 * On any failure mid-flight we unlink the temp file. The original target
 * is never opened for writing, so a crash leaves it intact.
 */
function defaultAtomicWrite(fs: typeof import("node:fs")) {
  return (targetPath: string, contents: string, mode: number): void => {
    const dir = dirname(targetPath);
    const tmpName = `.${basename(targetPath)}.tmp.${process.pid}.${Date.now()}.${Math.random()
      .toString(36)
      .slice(2, 8)}`;
    const tmpPath = join(dir, tmpName);
    let fd: number | undefined;
    try {
      fs.writeFileSync(tmpPath, contents, { mode });
      fd = fs.openSync(tmpPath, "r+");
      fs.fsyncSync(fd);
      fs.closeSync(fd);
      fd = undefined;
      fs.renameSync(tmpPath, targetPath);
      // F1.4: writeFileSync's `mode` is ignored when overwriting an existing
      // file. The atomic rename above usually preserves the temp inode's
      // 0o600 mode, but force-tighten unconditionally so any cross-fs edge
      // case still ends up locked down.
      try {
        fs.chmodSync(targetPath, mode);
      } catch {
        // best-effort
      }
      // F5 P0-GAP #4: fsync the parent directory so the rename survives a
      // hard crash. Without it, the new directory entry can be lost on
      // power-cut even though the inode is durable. Best-effort: not all
      // filesystems / platforms support directory fsync.
      let dirFd: number | undefined;
      try {
        dirFd = fs.openSync(dir, "r");
        fs.fsyncSync(dirFd);
      } catch {
        // best-effort: e.g. Windows / network mounts may reject this.
      } finally {
        if (dirFd !== undefined) {
          try {
            fs.closeSync(dirFd);
          } catch {
            // ignore
          }
        }
      }
    } catch (err) {
      if (fd !== undefined) {
        try {
          fs.closeSync(fd);
        } catch {
          // ignore
        }
      }
      try {
        if (fs.existsSync(tmpPath)) fs.unlinkSync(tmpPath);
      } catch {
        // ignore
      }
      throw err;
    }
  };
}
