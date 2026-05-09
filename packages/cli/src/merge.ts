// Pure helpers for transcript + usage merging — extracted from
// `interactive.ts` so the host file stays under the 250-LOC budget.

import type { TranscriptMessage, UsageDisplay } from "@openseek/tui";
import { freshAssistantTextRow, freshAssistantThinkingRow } from "./wire.ts";

/**
 * Append `text` onto the last `kind` row when present, otherwise push a
 * fresh row of that kind. Pure: returns a new array. Split per-kind so the
 * type narrowing on `last` survives — the union widens otherwise.
 */
export function mergeAssistant(
  prev: TranscriptMessage[],
  kind: "assistant-text" | "assistant-thinking",
  text: string,
): TranscriptMessage[] {
  const last = prev[prev.length - 1];
  if (kind === "assistant-text") {
    if (!last || last.kind !== "assistant-text") {
      return [...prev, { ...freshAssistantTextRow(), text } as TranscriptMessage];
    }
    return [...prev.slice(0, -1), { ...last, text: last.text + text }];
  }
  if (!last || last.kind !== "assistant-thinking") {
    return [...prev, { ...freshAssistantThinkingRow(), text } as TranscriptMessage];
  }
  return [...prev.slice(0, -1), { ...last, text: last.text + text }];
}

/**
 * Merge a fresh per-turn UsageSnapshot into the running cumulative display.
 * In/out tokens accumulate so the bar shows the session total; cache figures
 * replace because providers report them per-turn already.
 */
export function mergeUsage(
  prev: UsageDisplay | undefined,
  snap: { totalIn: number; totalOut: number; cacheCreation?: number; cacheRead?: number },
): UsageDisplay {
  const totalIn = (prev?.totalIn ?? 0) + snap.totalIn;
  const totalOut = (prev?.totalOut ?? 0) + snap.totalOut;
  const next: UsageDisplay = { totalIn, totalOut };
  if (snap.cacheCreation !== undefined) next.cacheCreation = snap.cacheCreation;
  else if (prev?.cacheCreation !== undefined) next.cacheCreation = prev.cacheCreation;
  if (snap.cacheRead !== undefined) next.cacheRead = snap.cacheRead;
  else if (prev?.cacheRead !== undefined) next.cacheRead = prev.cacheRead;
  return next;
}
