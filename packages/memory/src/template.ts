// @openseek/memory — 10-section template, render + parse

import {
  MEMORY_SECTION_ORDER,
  type Memory,
  type MemorySection,
  type MemorySectionId,
} from "./types.ts";

const SECTION_HEADINGS: Record<MemorySectionId, string> = {
  title: "Session Title",
  "current-state": "Current State",
  "task-spec": "Task Specification",
  files: "Files and Functions",
  workflow: "Workflow",
  errors: "Errors & Corrections",
  codebase: "Codebase and System Documentation",
  learnings: "Learnings",
  results: "Key Results",
  worklog: "Worklog",
};

const HEADING_TO_ID: Record<string, MemorySectionId> = Object.fromEntries(
  Object.entries(SECTION_HEADINGS).map(([id, heading]) => [heading.toLowerCase(), id]),
) as Record<string, MemorySectionId>;

const DEFAULT_INSTRUCTIONS: Record<MemorySectionId, string> = {
  title: "Name this run in one breath — what is the operator actually trying to land here.",
  "current-state":
    "Snapshot of where things stand right now: branch, last green build, blockers, open threads.",
  "task-spec":
    "Pin the contract: scope in, scope out, success gates. Quote the spec when it exists.",
  files:
    "Track every file or function that has been read, written, or is on the imminent path. One bullet per artifact.",
  workflow: "Sketch the running plan as steps. Strike through finished steps; queue the next one.",
  errors:
    "Log every failure mode hit, the root cause once known, and the corrective move. No band-aids.",
  codebase:
    "Capture load-bearing facts about the repo, services, and contracts that future sessions will need to reproduce context.",
  learnings:
    "Distill durable lessons — patterns that will outlast this run. One line each, plain English.",
  results: "Hard outcomes shipped: gates closed, tests added, numbers moved. Receipts only.",
  worklog: "Append-only chronological notes. Timestamp entries when convenient.",
};

function buildDefaultSection(id: MemorySectionId): MemorySection {
  return { instruction: DEFAULT_INSTRUCTIONS[id], content: "" };
}

export const DEFAULT_MEMORY_TEMPLATE: Memory = {
  sections: Object.fromEntries(
    MEMORY_SECTION_ORDER.map((id) => [id, buildDefaultSection(id)]),
  ) as Record<MemorySectionId, MemorySection>,
};

export function defaultMemory(): Memory {
  return {
    sections: Object.fromEntries(
      MEMORY_SECTION_ORDER.map((id) => [id, buildDefaultSection(id)]),
    ) as Record<MemorySectionId, MemorySection>,
  };
}

export function renderMemory(memory: Memory): string {
  const blocks: string[] = [];
  for (const id of MEMORY_SECTION_ORDER) {
    const section = memory.sections[id];
    const heading = SECTION_HEADINGS[id];
    const instruction = `_${section.instruction}_`;
    const content = section.content.trim();
    const body = content.length > 0 ? `${instruction}\n\n${content}` : instruction;
    blocks.push(`# ${heading}\n\n${body}`);
  }
  return `${blocks.join("\n\n")}\n`;
}

/**
 * Parse a markdown memory file. Missing sections fall back to the default
 * template instruction with empty content. Returns null when the input does
 * not look like a memory file at all (no recognizable H1 sections).
 */
export function parseMemory(md: string): Memory | null {
  if (typeof md !== "string" || md.trim().length === 0) {
    return null;
  }

  const lines = md.split("\n");
  const found = new Map<MemorySectionId, MemorySection>();

  let currentId: MemorySectionId | null = null;
  let buffer: string[] = [];

  const flush = () => {
    if (currentId === null) return;
    const raw = buffer.join("\n").trim();
    let instruction = DEFAULT_INSTRUCTIONS[currentId];
    let content = raw;
    const italicMatch = raw.match(/^_(.+?)_\s*(?:\n([\s\S]*))?$/);
    if (italicMatch && italicMatch[1] !== undefined) {
      instruction = italicMatch[1].trim();
      content = (italicMatch[2] ?? "").trim();
    }
    found.set(currentId, { instruction, content });
  };

  for (const line of lines) {
    const headingMatch = line.match(/^#\s+(.+?)\s*$/);
    if (headingMatch && headingMatch[1] !== undefined) {
      flush();
      const id = HEADING_TO_ID[headingMatch[1].toLowerCase()];
      currentId = id ?? null;
      buffer = [];
    } else if (currentId !== null) {
      buffer.push(line);
    }
  }
  flush();

  if (found.size === 0) {
    return null;
  }

  const sections = {} as Record<MemorySectionId, MemorySection>;
  for (const id of MEMORY_SECTION_ORDER) {
    sections[id] = found.get(id) ?? buildDefaultSection(id);
  }
  return { sections };
}

export function memorySectionHeading(id: MemorySectionId): string {
  return SECTION_HEADINGS[id];
}
