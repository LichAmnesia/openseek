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

// Upper bound on a single persisted memory item (chars). Bounds unbounded
// growth from a hostile or runaway extractor.
const MAX_ITEM_LEN = 500;

function isPathLike(fact: string): boolean {
  return DIR_HINT.test(fact) || EXT_HINT.test(fact);
}

/**
 * Neutralize a model-extracted item before it is persisted to the cross-session
 * memory store. The extractor's output can reflect UNTRUSTED content the model
 * just read (a file, a web page, tool output). Since `renderMemory` feeds the
 * store back into the prompt and `parseMemory` treats `^#` lines as section
 * boundaries and a leading `_italic_` line as a section INSTRUCTION, a raw
 * multi-line item could forge a fake section + authoritative instruction under a
 * trusted heading on the next session — cross-session memory poisoning via
 * indirect prompt injection.
 *
 * Defense: force every stored item to a single line and cap length. Combined
 * with the `- ` bullet prefix in `appendBullet`, this makes it impossible for a
 * stored item to be re-parsed as a heading or an instruction line. Returns ""
 * when nothing survives (caller must then skip the item entirely).
 */
export function sanitizeMemoryItem(item: string): string {
  const collapsed = item
    // C0/C1 control chars incl. newline, CR, tab, DEL → space (\p{Cc} =
    // U+0000–U+001F and U+007F–U+009F). This alone removes the only codepoint
    // (U+000A) that `parseMemory` splits on.
    .replace(/\p{Cc}+/gu, " ")
    // Collapse remaining whitespace runs. NOTE: this is also what neutralizes
    // Unicode line/paragraph separators U+2028/U+2029 (category Zl/Zp, NOT Cc),
    // so keep this replace even though they can't split parseMemory today —
    // it's defense in depth.
    .replace(/\s+/g, " ")
    .trim();
  if (collapsed.length <= MAX_ITEM_LEN) return collapsed;
  // Truncate on codepoint boundaries (never split a surrogate pair) while still
  // bounding the UTF-16 length to MAX_ITEM_LEN, so an astral-heavy item can't
  // sneak ~2x past the cap.
  let out = "";
  for (const ch of collapsed) {
    if (out.length + ch.length > MAX_ITEM_LEN - 1) break;
    out += ch;
  }
  return `${out}…`;
}

// Append an ALREADY-sanitized, non-empty item as a `- ` bullet.
function appendBullet(content: string, safeItem: string): string {
  const bullet = safeItem.startsWith("- ") ? safeItem : `- ${safeItem}`;
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

  // Sanitize first and skip anything that collapses to empty — an item that
  // survives as "" must not be counted, must not mark a section touched, and
  // must not trigger a needless save (spec condition 5).
  for (const fact of extracted.facts) {
    const safe = sanitizeMemoryItem(fact);
    if (safe.length === 0) continue;
    const target: MemorySectionId = isPathLike(safe) ? "files" : "current-state";
    memory.sections[target].content = appendBullet(memory.sections[target].content, safe);
    touched.add(target);
    applied += 1;
  }
  for (const err of extracted.errors) {
    const safe = sanitizeMemoryItem(err);
    if (safe.length === 0) continue;
    memory.sections.errors.content = appendBullet(memory.sections.errors.content, safe);
    touched.add("errors");
    applied += 1;
  }
  for (const learning of extracted.learnings) {
    const safe = sanitizeMemoryItem(learning);
    if (safe.length === 0) continue;
    memory.sections.learnings.content = appendBullet(memory.sections.learnings.content, safe);
    touched.add("learnings");
    applied += 1;
  }

  if (applied > 0) {
    await saveMemory(memory, scope, opts.workspace, opts.io);
  }
  return { applied, sections: [...touched] };
}

export type { Extracted, MemoryDelta, Memory };
