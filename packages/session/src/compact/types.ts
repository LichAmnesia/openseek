// Shared types for the 5 compaction strategies (SPEC G2.1).
//
// All strategies are pure functions over OpenSeekMessage[] — they MUST NOT
// mutate the input array or any of its element objects. Returning a new
// array (and new ContentBlock arrays for any modified message) keeps the
// session-state diff trivial for the caller and makes the strategies safe
// to compose / test in isolation.

import type { OpenSeekMessage } from "@openseek/provider";
import type { UsageSnapshot } from "../types.ts";

export type CompactStrategy = "micro" | "auto" | "reactive" | "session-memory" | "snip";

/** Standard input every strategy receives. */
export interface CompactInput {
  messages: OpenSeekMessage[];
  /** Latest cumulative usage snapshot (optional; only auto/reactive use it). */
  usage?: UsageSnapshot;
  /** Provider context window for ratio-based decisions (auto). */
  capacity?: number;
}

/** Standard output every strategy returns. */
export interface CompactOutput {
  /** New message array — fresh outer array; element refs may be reused when untouched. */
  messages: OpenSeekMessage[];
  /** How many message slots were dropped vs the input length. */
  dropped: number;
  /** Which strategy produced this output (echoed back for telemetry). */
  strategy: CompactStrategy;
}

/** Marker text injected by microCompact / reactiveCompact in place of stale tool results. */
export const CLEARED_TOOL_RESULT_MARKER = "[Old tool result content cleared]";
