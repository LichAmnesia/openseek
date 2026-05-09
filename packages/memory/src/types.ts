// @openseek/memory — types

import type { OpenSeekMessage } from "@openseek/provider";

export type MemorySectionId =
  | "title"
  | "current-state"
  | "task-spec"
  | "files"
  | "workflow"
  | "errors"
  | "codebase"
  | "learnings"
  | "results"
  | "worklog";

export const MEMORY_SECTION_ORDER: MemorySectionId[] = [
  "title",
  "current-state",
  "task-spec",
  "files",
  "workflow",
  "errors",
  "codebase",
  "learnings",
  "results",
  "worklog",
];

export interface MemorySection {
  /** Italic instruction line under the H1; never deleted. */
  instruction: string;
  /** Free-form markdown body that follows the instruction. */
  content: string;
}

export type Memory = {
  sections: Record<MemorySectionId, MemorySection>;
};

export type MemoryScope = "global" | "workspace";

export interface MemoryFile {
  path: string;
  scope: MemoryScope;
}

/** Injectable IO so tests can avoid touching the real filesystem. */
export interface MemoryIO {
  read: (path: string) => Promise<string | null>;
  write: (path: string, content: string) => Promise<void>;
  exists: (path: string) => Promise<boolean>;
}

/** Output of an extractor — facts/errors/learnings harvested from a transcript. */
export interface Extracted {
  facts: string[];
  errors: string[];
  learnings: string[];
}

/** Result of applying an Extracted batch to a Memory file. */
export interface MemoryDelta {
  applied: number;
  sections: MemorySectionId[];
}

export type MemoryExtractor = (messages: OpenSeekMessage[]) => Promise<Extracted>;

export interface ExtractMemoriesOptions {
  extractor: MemoryExtractor;
  scope?: MemoryScope;
  workspace?: string;
  io?: MemoryIO;
}
