// @openseek/session/compact — barrel export for the 5 compaction strategies
// and the orchestrator (SPEC G2.1).

export {
  CLEARED_TOOL_RESULT_MARKER,
  type CompactInput,
  type CompactOutput,
  type CompactStrategy,
} from "./types.ts";

export { microCompact, type MicroCompactOptions } from "./micro.ts";
export { autoCompact, type AutoCompactOptions } from "./auto.ts";
export {
  reactiveCompact,
  shouldReactiveCompact,
  type ReactiveCompactOptions,
} from "./reactive.ts";
export {
  sessionMemoryCompact,
  type SessionMemoryCompactOptions,
} from "./session-memory.ts";
export { snipCompact, type SnipCompactOptions } from "./snip.ts";
export { decideCompact, type DecideCompactOptions } from "./orchestrator.ts";
export { compactNow, type CompactNowOptions, type CompactNowResult } from "./now.ts";
