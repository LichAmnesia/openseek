// @openseek/memory — extractMemories: harvest facts/errors/learnings into memory.md

import type { OpenSeekMessage } from "@openseek/provider";
import { loadMemory, saveMemory } from "./loader.ts";
import type {
  Extracted,
  ExtractMemoriesOptions,
  Memory,
  MemoryDelta,
  MemorySectionId,
} from "./types.ts";

// A fact is "path-like" if it carries a directory separator or a recognizable
// file extension. We deliberately keep the extension list narrow so prose like
// "G2.4 gate green" is NOT misclassified as a file path.
const DIR_HINT = /(?:^|\s)(?:\.\.?\/|\/|packages\/|src\/|tests\/|\.openseek\b)/;
const EXT_HINT = /\.(?:ts|tsx|js|jsx|md|json|toml|yaml|yml|sh|css|html|rs|py|go|java)\b/i;

function isPathLike(fact: string): boolean {
  return DIR_HINT.test(fact) || EXT_HINT.test(fact);
}

function appendBullet(content: string, item: string): string {
  const trimmedItem = item.trim();
  if (trimmedItem.length === 0) return content;
  const bullet = trimmedItem.startsWith("- ") ? trimmedItem : `- ${trimmedItem}`;
  if (content.trim().length === 0) return bullet;
  return `${content.trimEnd()}\n${bullet}`;
}

export async function extractMemories(
  messages: OpenSeekMessage[],
  opts: ExtractMemoriesOptions,
): Promise<MemoryDelta> {
  const extracted = await opts.extractor(messages);
  const scope = opts.scope ?? "workspace";
  const memory = await loadMemory(scope, opts.workspace, opts.io);

  const touched = new Set<MemorySectionId>();
  let applied = 0;

  for (const fact of extracted.facts) {
    const target: MemorySectionId = isPathLike(fact) ? "files" : "current-state";
    memory.sections[target].content = appendBullet(memory.sections[target].content, fact);
    touched.add(target);
    applied += 1;
  }
  for (const err of extracted.errors) {
    memory.sections.errors.content = appendBullet(memory.sections.errors.content, err);
    touched.add("errors");
    applied += 1;
  }
  for (const learning of extracted.learnings) {
    memory.sections.learnings.content = appendBullet(
      memory.sections.learnings.content,
      learning,
    );
    touched.add("learnings");
    applied += 1;
  }

  if (applied > 0) {
    await saveMemory(memory, scope, opts.workspace, opts.io);
  }
  return { applied, sections: [...touched] };
}

export type { Extracted, MemoryDelta, Memory };
