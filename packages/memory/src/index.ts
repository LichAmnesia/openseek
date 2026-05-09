// @openseek/memory — cross-session memory (10-section template + extractMemories)

export const PACKAGE_NAME = "@openseek/memory";

export type {
  Extracted,
  ExtractMemoriesOptions,
  Memory,
  MemoryDelta,
  MemoryExtractor,
  MemoryFile,
  MemoryIO,
  MemoryScope,
  MemorySection,
  MemorySectionId,
} from "./types.ts";
export { MEMORY_SECTION_ORDER } from "./types.ts";

export {
  DEFAULT_MEMORY_TEMPLATE,
  defaultMemory,
  memorySectionHeading,
  parseMemory,
  renderMemory,
} from "./template.ts";

export { memoryDirFor, memoryFile, memoryFilePath } from "./paths.ts";

export { bunMemoryIO, loadMemory, mergeMemory, saveMemory } from "./loader.ts";

export { extractMemories } from "./extract.ts";
