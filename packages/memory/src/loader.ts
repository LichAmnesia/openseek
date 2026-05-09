// @openseek/memory — load/save Memory through Bun.file with DI override

import { mkdir } from "node:fs/promises";
import { defaultMemory, parseMemory, renderMemory } from "./template.ts";
import { memoryDirFor, memoryFilePath } from "./paths.ts";
import type {
  Memory,
  MemoryIO,
  MemoryScope,
  MemorySection,
  MemorySectionId,
} from "./types.ts";

export const bunMemoryIO: MemoryIO = {
  read: async (filePath) => {
    const file = Bun.file(filePath);
    if (!(await file.exists())) return null;
    return await file.text();
  },
  write: async (filePath, content) => {
    await mkdir(memoryDirFor(filePath), { recursive: true });
    await Bun.write(filePath, content);
  },
  exists: async (filePath) => {
    return await Bun.file(filePath).exists();
  },
};

export async function loadMemory(
  scope: MemoryScope,
  workspace?: string,
  ioOverride?: MemoryIO,
): Promise<Memory> {
  const io = ioOverride ?? bunMemoryIO;
  const filePath = memoryFilePath(scope, workspace);
  const raw = await io.read(filePath);
  if (raw === null) return defaultMemory();
  const parsed = parseMemory(raw);
  return parsed ?? defaultMemory();
}

export async function saveMemory(
  memory: Memory,
  scope: MemoryScope,
  workspace?: string,
  ioOverride?: MemoryIO,
): Promise<void> {
  const io = ioOverride ?? bunMemoryIO;
  const filePath = memoryFilePath(scope, workspace);
  await io.write(filePath, renderMemory(memory));
}

export function mergeMemory(base: Memory, delta: Partial<Memory>): Memory {
  const merged = {
    sections: { ...base.sections } as Record<MemorySectionId, MemorySection>,
  };
  if (!delta.sections) return merged;
  for (const id of Object.keys(delta.sections) as MemorySectionId[]) {
    const incoming = delta.sections[id];
    if (!incoming) continue;
    const current = merged.sections[id];
    merged.sections[id] = {
      instruction: incoming.instruction || current.instruction,
      content: incoming.content ?? current.content,
    };
  }
  return merged;
}
