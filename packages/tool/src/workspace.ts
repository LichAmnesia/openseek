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

export function ensureRelative(target: string): void {
  if (isAbsolute(target)) {
    throw new Error(`absolute path not allowed: ${target}`);
  }
}
