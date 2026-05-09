// @openseek/memory — filesystem path resolution

import os from "node:os";
import path from "node:path";
import type { MemoryFile, MemoryScope } from "./types.ts";

const MEMORY_DIR = ".openseek";
const MEMORY_FILENAME = "memory.md";

export function memoryFilePath(scope: MemoryScope, workspace?: string): string {
  if (scope === "global") {
    return path.join(os.homedir(), MEMORY_DIR, MEMORY_FILENAME);
  }
  if (!workspace || workspace.trim().length === 0) {
    throw new Error("memoryFilePath: workspace path is required when scope='workspace'");
  }
  return path.join(workspace, MEMORY_DIR, MEMORY_FILENAME);
}

export function memoryFile(scope: MemoryScope, workspace?: string): MemoryFile {
  return { path: memoryFilePath(scope, workspace), scope };
}

export function memoryDirFor(filePath: string): string {
  return path.dirname(filePath);
}
