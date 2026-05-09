// reactiveCompact — heuristic-driven aggressive micro-compaction
// (SPEC G2.1 #3).
//
// Triggered by the orchestrator when the usage history shows a sustained
// cache-miss pattern (last 3 turns: cache_read=0 AND cache_creation>0). The
// signal is that the wire prefix is being rebuilt every turn — likely the
// stale tool-result blocks in the middle have evicted the prefix and the
// cheapest fix is to slim them aggressively (keep 2 instead of 5).
//
// Implementation reuses microCompact's logic with a tighter `keep` value.

import { microCompact } from "./micro.ts";
import type { CompactInput, CompactOutput } from "./types.ts";
import type { UsageSnapshot } from "../types.ts";

export interface ReactiveCompactOptions {
  /** Most-recent-first usage history; we look at the last 3. */
  history: UsageSnapshot[];
  /** Override the aggressive keep count; default 2. */
  keepRecentToolResults?: number;
}

/**
 * Pure trigger predicate — exposed for tests + the orchestrator.
 * Returns true when the last 3 snapshots all show cache_read=0 with
 * cache_creation>0 (i.e. provider keeps re-warming the prefix).
 */
export function shouldReactiveCompact(history: UsageSnapshot[]): boolean {
  if (history.length < 3) return false;
  const tail = history.slice(-3);
  return tail.every((u) => (u.cacheRead ?? 0) === 0 && (u.cacheCreation ?? 0) > 0);
}

export function reactiveCompact(
  input: CompactInput,
  opts: ReactiveCompactOptions,
): CompactOutput {
  // Even when the trigger doesn't fire we still apply the aggressive trim —
  // the orchestrator is the gatekeeper. This way callers who reach for
  // reactiveCompact directly get the stronger compaction they asked for.
  const result = microCompact(input, {
    keepRecentToolResults: opts.keepRecentToolResults ?? 2,
  });
  return { ...result, strategy: "reactive" };
}
