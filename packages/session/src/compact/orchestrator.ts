// decideCompact — the strategy selector (SPEC G2.1).
//
// Pure function: given current SessionState, the latest UsageSnapshot, and
// the recent usage history, return which compaction strategy should run
// (or null if none). The runner uses this to decide whether to invoke
// microCompact at turn-end; user-driven /compact and /snip bypass this and
// invoke the matching strategy directly.
//
// Decision table (first match wins):
//   1. usage.totalIn > 0.8 * capacity                                → "auto"
//   2. shouldReactiveCompact(history)                                → "reactive"
//   3. tool_result block count > MICRO_THRESHOLD (default 6)         → "micro"
//   4. otherwise                                                     → null

import type { CompactStrategy } from "./types.ts";
import type { SessionState, UsageSnapshot } from "../types.ts";
import { shouldReactiveCompact } from "./reactive.ts";

export interface DecideCompactOptions {
  /** Provider context window for ratio comparison. */
  capacity?: number;
  /** Tool-result count above which microCompact runs. Default 6. */
  microThreshold?: number;
  /** Auto threshold ratio (0..1) of context window. Default 0.8. */
  autoThreshold?: number;
}

export function decideCompact(
  state: SessionState,
  usage?: UsageSnapshot,
  history: UsageSnapshot[] = [],
  opts: DecideCompactOptions = {},
): CompactStrategy | null {
  const microThreshold = opts.microThreshold ?? 6;
  const autoThreshold = opts.autoThreshold ?? 0.8;

  if (usage && opts.capacity && opts.capacity > 0) {
    if (usage.totalIn > opts.capacity * autoThreshold) return "auto";
  }

  if (shouldReactiveCompact(history)) return "reactive";

  let toolResultCount = 0;
  for (const msg of state.messages) {
    for (const block of msg.content) {
      if (block.type === "tool_result") toolResultCount += 1;
    }
  }
  if (toolResultCount > microThreshold) return "micro";

  return null;
}
