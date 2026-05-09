// Test-only fake LanguageModelV3 — feed a scripted chunk sequence in,
// runSession sees it as a real stream. Not exported from index.ts.
//
// SDK internal types (LanguageModelV3, LanguageModelV3StreamPart) live in
// `@ai-sdk/provider` v3.0.x; we type them as `any` here to keep this file
// independent of which transitive dep version is hoisted.

import type { LanguageModel, LanguageModelUsage } from "ai";

// biome-ignore lint/suspicious/noExplicitAny: SDK internal stream-part union; structural-only here.
export type MockChunk = any;

const DEFAULT_USAGE: LanguageModelUsage = {
  inputTokens: 0,
  outputTokens: 0,
  totalTokens: 0,
} as unknown as LanguageModelUsage;

/**
 * Build a chunk sequence representing a plain text reply.
 */
export function textChunks(text: string, id = "txt-1"): MockChunk[] {
  return [
    { type: "stream-start", warnings: [] },
    { type: "text-start", id },
    { type: "text-delta", id, delta: text },
    { type: "text-end", id },
    {
      type: "finish",
      usage: DEFAULT_USAGE,
      finishReason: { unified: "stop", raw: "stop" },
    },
  ];
}

/**
 * Build a chunk sequence representing a thinking-prefix + text reply.
 */
export function thinkingThenTextChunks(thinking: string, text: string): MockChunk[] {
  return [
    { type: "stream-start", warnings: [] },
    { type: "reasoning-start", id: "rsn-1" },
    { type: "reasoning-delta", id: "rsn-1", delta: thinking },
    { type: "reasoning-end", id: "rsn-1" },
    { type: "text-start", id: "txt-1" },
    { type: "text-delta", id: "txt-1", delta: text },
    { type: "text-end", id: "txt-1" },
    {
      type: "finish",
      usage: DEFAULT_USAGE,
      finishReason: { unified: "stop", raw: "stop" },
    },
  ];
}

/**
 * Build a chunk sequence representing a tool call. Caller must push the
 * second-round response chunks themselves to validate full multi-turn behavior.
 */
export function toolCallChunks(
  toolName: string,
  input: unknown,
  toolCallId = "call-1",
): MockChunk[] {
  // V3 protocol requires `input` as a stringified JSON arg blob — ai-SDK
  // parses it before invoking `execute`. Encode here so tests can pass
  // structured objects naturally.
  const inputJson = typeof input === "string" ? input : JSON.stringify(input);
  return [
    { type: "stream-start", warnings: [] },
    { type: "tool-input-start", id: toolCallId, toolName },
    { type: "tool-input-end", id: toolCallId },
    { type: "tool-call", toolCallId, toolName, input: inputJson },
    {
      type: "finish",
      usage: DEFAULT_USAGE,
      finishReason: { unified: "tool-calls", raw: "tool_calls" },
    },
  ];
}

/**
 * Create a mock model that scripts multiple turns. The mock keeps an
 * internal cursor so successive `doStream` calls (auto-loop) advance through
 * the supplied phase list.
 */
export interface PhaseScript {
  /** Chunks for this phase. */
  chunks: MockChunk[];
}

export interface MockModelHandle {
  model: LanguageModel & { __mock: true };
  /** Number of doStream calls observed. */
  callCount(): number;
  /** AbortSignals received by each doStream call (in order). */
  signals(): Array<AbortSignal | undefined>;
  /** ProviderOptions blobs ai-SDK forwarded on each doStream call. */
  providerOptionsLog(): unknown[];
  /**
   * Per-call prompt arrays as ai-SDK forwarded them on doStream — useful for
   * asserting multi-turn history was preserved (Bug 2.1) and that
   * reasoning_content / thinking blocks survived the round-trip (Bug 2.2).
   */
  promptLog(): unknown[];
}

/**
 * Multi-phase mock model. `phases[N]` is consumed by the Nth doStream call.
 * After exhausting phases the mock falls back to an empty finish chunk.
 */
export function createMockModel(opts: {
  phases: PhaseScript[];
  modelId?: string;
  providerId?: string;
  /** Inject AbortError after K bytes of stream output (per-phase). */
  abortAfterChunk?: number;
}): MockModelHandle {
  let cursor = 0;
  const signals: Array<AbortSignal | undefined> = [];
  const providerOptionsLog: unknown[] = [];
  const promptLog: unknown[] = [];

  const model = {
    specificationVersion: "v3",
    provider: opts.providerId ?? "mock",
    modelId: opts.modelId ?? "mock-model",
    supportedUrls: {},
    async doGenerate() {
      throw new Error("[mock] doGenerate not implemented");
    },
    async doStream(callOpts: {
      abortSignal?: AbortSignal;
      providerOptions?: unknown;
      // biome-ignore lint/suspicious/noExplicitAny: SDK passes structurally-typed prompt array.
      prompt?: any;
    }) {
      signals.push(callOpts.abortSignal);
      providerOptionsLog.push(callOpts.providerOptions);
      promptLog.push(callOpts.prompt);
      const phase = opts.phases[cursor] ?? { chunks: [] };
      cursor += 1;
      const stream = scriptedReadable(phase.chunks, callOpts.abortSignal, opts.abortAfterChunk);
      return { stream };
    },
    __mock: true as const,
    // biome-ignore lint/suspicious/noExplicitAny: SDK structural union, we satisfy it directly.
  } as any;

  return {
    model,
    callCount: () => cursor,
    signals: () => signals,
    providerOptionsLog: () => providerOptionsLog,
    promptLog: () => promptLog,
  };
}

function scriptedReadable(
  chunks: MockChunk[],
  signal: AbortSignal | undefined,
  abortAfterChunk?: number,
): ReadableStream<MockChunk> {
  let i = 0;
  return new ReadableStream<MockChunk>({
    async pull(controller) {
      if (signal?.aborted) {
        controller.error(makeAbortError());
        return;
      }
      if (typeof abortAfterChunk === "number" && i >= abortAfterChunk) {
        controller.error(makeAbortError());
        return;
      }
      if (i >= chunks.length) {
        controller.close();
        return;
      }
      controller.enqueue(chunks[i] as MockChunk);
      i += 1;
    },
    cancel() {
      // ai-SDK closes the stream on outer abort; nothing to clean up.
    },
  });
}

function makeAbortError(): Error {
  const err = new Error("aborted");
  err.name = "AbortError";
  return err;
}
