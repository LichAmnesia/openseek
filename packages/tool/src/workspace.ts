import { isAbsolute, relative, resolve } from "node:path";

export interface ResolvedPath {
  abs: string;
  relToCwd: string;
}

export function resolveWithinCwd(cwd: string, target: string): ResolvedPath {
  const abs = isAbsolute(target) ? resolve(target) : resolve(cwd, target);
  const cwdAbs = resolve(cwd);
  const rel = relative(cwdAbs, abs);
  if (rel.startsWith("..") || isAbsolute(rel)) {
    throw new Error(`path escapes workspace: ${target}`);
  }
  return { abs, relToCwd: rel };
}

/**
 * Resolve a path for READ-ONLY tools. Unlike resolveWithinCwd, absolute
 * paths outside the workspace are allowed: `bash` is already unrestricted
 * so the fence adds no security, and one-shot runs routinely reference
 * task files by absolute path (`openseek -p "/path/to/task.md ..."`).
 * Mutating tools (write / edit / apply_patch / …) keep resolveWithinCwd.
 * `relToCwd` falls back to the absolute path for out-of-workspace targets.
 */
export function resolveReadable(cwd: string, target: string): ResolvedPath {
  const abs = isAbsolute(target) ? resolve(target) : resolve(cwd, target);
  const rel = relative(resolve(cwd), abs);
  const display = rel.startsWith("..") || isAbsolute(rel) ? abs : rel;
  return { abs, relToCwd: display };
}

export function ensureRelative(target: string): void {
  if (isAbsolute(target)) {
    throw new Error(`absolute path not allowed: ${target}`);
  }
}
