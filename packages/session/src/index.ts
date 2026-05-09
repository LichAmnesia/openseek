// @openseek/session — Streaming run loop, cancel handling, transform shims (G1.3 + G1.6).
// SPEC.md milestones v0.1 G1.3 + G1.6.

export const PACKAGE_NAME = "@openseek/session";

export type {
  ReasoningEffort,
  RunOptions,
  SessionState,
  StreamEvent,
  ToolApprovalRequest,
  ToolCallReq,
  ToolCallResolution,
  UsageSnapshot,
} from "./types.ts";

export { runSession } from "./run.ts";
export { filterToolsByMode } from "./mode-gate.ts";
export { convertToAiSdk, convertToolsToAiSdk } from "./transform.ts";

export * as compact from "./compact/index.ts";
export {
  CLEARED_TOOL_RESULT_MARKER,
  autoCompact,
  compactNow,
  decideCompact,
  microCompact,
  reactiveCompact,
  sessionMemoryCompact,
  shouldReactiveCompact,
  snipCompact,
  type CompactInput,
  type CompactNowOptions,
  type CompactNowResult,
  type CompactOutput,
  type CompactStrategy,
} from "./compact/index.ts";
