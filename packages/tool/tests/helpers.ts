import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { noopLogger, type ToolContext } from "../src/types.ts";

export function makeTmpDir(prefix = "openseek-tool-"): string {
  return mkdtempSync(join(tmpdir(), prefix));
}

export function cleanupTmpDir(dir: string): void {
  rmSync(dir, { recursive: true, force: true });
}

export function makeCtx(cwd: string, overrides: Partial<ToolContext> = {}): ToolContext {
  return {
    abort: new AbortController().signal,
    cwd,
    mode: "yolo",
    log: noopLogger,
    ...overrides,
  };
}
