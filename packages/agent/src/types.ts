// Public types for the @openseek/agent package.
// G3.2 (rlm_query) + G3.3 (agent_spawn) wire real fan-out and forked
// sub-sessions on top of the v0.3 tool stubs.

import type { LLMProvider, ProviderCapability } from "@openseek/provider";
import type { AnyTool } from "@openseek/tool";

/** Stub-friendly worker function for rlm_query fan-out. */
export type RlmRunner = (query: string, signal: AbortSignal) => Promise<string>;

/** One worker output emitted by `runRlm`. */
export interface RlmResult {
  /** The original query string. */
  query: string;
  /** Worker response text, or `[error: <msg>]` if the runner threw. */
  response: string;
  /** Wall-clock duration in milliseconds. */
  ms: number;
}

export interface RunRlmOptions {
  /** Hard cap on concurrent in-flight runner promises. Default 16. */
  maxParallel?: number;
  /** Per-query worker. v0.3 stubs return mock strings; v0.5+ wires a cheap LLM. */
  runner: RlmRunner;
  /** Optional outer abort to cancel all pending workers. */
  signal?: AbortSignal;
}

/** Public input contract for `spawnAgent`. */
export interface AgentSpawnRequest {
  /** Sub-task description forwarded to the child as the user turn. */
  prompt: string;
  /** Hard cap on assistant→tool→assistant loop steps. Default 12 (run.ts default). */
  maxSteps?: number;
  /** Hard wall-clock timeout in ms. Default 60_000. */
  timeoutMs?: number;
}

/** Public result emitted by `spawnAgent.result`. */
export interface AgentResult {
  /** Random child id, suitable for log correlation. */
  id: string;
  /** Outcome of the child run. */
  status: "done" | "failed" | "cancelled" | "timeout";
  /** Concatenated assistant text from the child session (text-delta events). */
  output: string;
  /** Wall-clock duration in milliseconds. */
  ms: number;
  /** Error message when status === "failed". */
  error?: string;
}

/** Wiring needed to actually drive a child session. */
export interface AgentSpawnDeps {
  provider: LLMProvider;
  model: string;
  capability: ProviderCapability;
  tools: Map<string, AnyTool>;
  apiKey?: string;
  baseURL?: string;
  cwd?: string;
}

/** Live handle returned by `spawnAgent` — caller awaits `result` or calls `abort`. */
export interface AgentHandle {
  id: string;
  abort: () => void;
  result: Promise<AgentResult>;
}
