// snipCompact — user-driven local range deletion (SPEC G2.1 #5).
//
// The /snip slash command exposes this directly: user says "drop messages
// 4..7" and we splice them out. Range is inclusive on both ends. Bounds
// errors throw at the system boundary — the command layer turns the throw
// into a friendly TUI error; the strategy itself does not silently swallow
// bad input because that would mask user typos.

import type { CompactInput, CompactOutput } from "./types.ts";

export interface SnipCompactOptions {
  /** Inclusive start index. */
  startIdx: number;
  /** Inclusive end index. Must be ≥ startIdx and < messages.length. */
  endIdx: number;
}

export function snipCompact(input: CompactInput, opts: SnipCompactOptions): CompactOutput {
  const { messages } = input;
  const { startIdx, endIdx } = opts;
  if (
    !Number.isInteger(startIdx) ||
    !Number.isInteger(endIdx) ||
    startIdx < 0 ||
    endIdx < startIdx ||
    endIdx >= messages.length
  ) {
    throw new RangeError(
      `snipCompact: invalid range [${startIdx}, ${endIdx}] for length ${messages.length}`,
    );
  }
  const out = [...messages.slice(0, startIdx), ...messages.slice(endIdx + 1)];
  return {
    messages: out,
    dropped: endIdx - startIdx + 1,
    strategy: "snip",
  };
}
