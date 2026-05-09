// Session-layer types for OpenSeek (G1.3 / G1.6).
// SessionState owns mutable conversation, RunOptions wires together
// provider/tools/abort, StreamEvent is the discriminated union surfaced to
// the TUI / cli upstream.

import type { LanguageModelUsage } from "ai";
import type { LspRouter } from "@openseek/lsp";
import type { LLMProvider, OpenSeekMessage, ProviderCapability } from "@openseek/provider";
import type { AnyTool, ToolMode, ToolPermission, ToolResult } from "@openseek/tool";

export type ReasoningEffort = "off" | "high" | "max";

export interface SessionState {
  messages: OpenSeekMessage[];
  mode: ToolMode;
  reasoningEffort: ReasoningEffort;
  model: string;
  provider: string;
  /**
   * One-shot signal: when true, runSession strips Anthropic-style
   * `cache_control` breakpoints from outbound wire messages so the next
   * request misses the provider prompt cache by design (T1: /break-cache).
   *
   * Caller (cli/interactive.ts) must clear this back to undefined after the
   * generator finishes — the flag is intentionally NOT auto-reset by the
   * runner so a panic mid-stream still leaves the next attempt with
   * cache-skipping behavior.
   */
  breakCache?: boolean;
}

export interface ToolCallReq {
  id: string;
  name: string;
  input: unknown;
}

export interface ToolCallResolution {
  id: string;
  name: string;
  result: ToolResult;
}

export interface ToolApprovalRequest {
  id: string;
  name: string;
  input: unknown;
  permission: ToolPermission;
}

/** Cumulative usage snapshot surfaced for status-bar rendering (G2.8). */
export interface UsageSnapshot {
  /** Total prompt-side tokens (cached + uncached) for the latest turn. */
  totalIn: number;
  /** Total completion-side tokens for the latest turn. */
  totalOut: number;
  /** Tokens written into the provider cache (e.g. Anthropic cache_creation). */
  cacheCreation?: number;
  /** Tokens served from the provider cache (e.g. Anthropic cache_read). */
  cacheRead?: number;
}

export type StreamEvent =
  | { type: "text-delta"; delta: string }
  | { type: "thinking-delta"; delta: string }
  | { type: "tool-call"; call: ToolCallReq }
  | { type: "tool-result"; result: ToolCallResolution }
  | { type: "finish"; usage?: LanguageModelUsage }
  | { type: "usage-update"; snapshot: UsageSnapshot }
  | { type: "error"; err: unknown }
  | { type: "cancelled"; partial?: OpenSeekMessage }
  /**
   * Synthesized history rows for the just-completed (or just-cancelled)
   * assistant turn. `messages` is the ORDERED list to append to the wire
   * history so the next request includes:
   *   1. assistant message (text + thinking + tool_call blocks)
   *   2. tool messages (one per tool_call, role="tool", with toolCallId)
   * The assistant message has `reasoningContent` set when the provider
   * emitted `reasoning-delta` chunks, so providers with
   * `requiresReasoningReplay: true` can replay it on the next request.
   *
   * Callers SHOULD push these into the array they pass as `state.messages`
   * (or whatever holds wire history). The runner does NOT mutate the
   * caller-supplied array itself — it only emits this event so the caller
   * keeps ownership of the history reference.
   */
  | { type: "assistant-turn"; messages: OpenSeekMessage[] }
  | { type: "turn-end"; usage?: LanguageModelUsage };

export interface RunOptions {
  provider: LLMProvider;
  model: string;
  /** Tool registry — name → Tool. */
  tools: Map<string, AnyTool>;
  capability: ProviderCapability;
  signal: AbortSignal;
  /** API key forwarded to provider.createClient(). Required for real providers; mocks ignore. */
  apiKey?: string;
  /** Optional baseURL override forwarded to provider.createClient(). */
  baseURL?: string;
  /** Optional override for working directory injected into ToolContext. */
  cwd?: string;
  /** Hard ceiling on the assistant→tool→assistant loop count per turn. */
  maxSteps?: number;
  /**
   * Override the SessionState reasoning effort just for this run (G2.6).
   * When unset, the runner falls back to `state.reasoningEffort`.
   */
  reasoningEffort?: ReasoningEffort;
  /**
   * When true, runSession applies microCompact to `state.messages` after a
   * successful turn-end (SPEC G2.1). The compaction is best-effort: only
   * the local `state` reference passed in is mutated, and only if it owns a
   * `messages` array we can replace. Default false.
   */
  autoCompact?: boolean;
  /** Tool-result keep count when autoCompact runs (default 5). */
  autoCompactKeep?: number;
  /**
   * Optional LSP router (G3.4). When supplied, after each edit-family tool
   * call (`edit` / `write` / `apply_patch` / `notebook_edit`) succeeds in
   * the current turn, the runner probes the touched file and appends a
   * `system` message containing the formatted diagnostics to
   * `state.messages` at turn-end. Best-effort: failures are swallowed.
  */
  lspRouter?: LspRouter;
  /**
   * Agent-mode approval hook. When supplied, non-auto tools (`ask` and
   * `deny-in-plan`) pause before execution. Returning false injects a
   * synthetic tool error and skips the side effect. YOLO bypasses this hook.
   */
  approveToolCall?: (req: ToolApprovalRequest) => Promise<boolean>;
}
