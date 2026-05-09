// Shared e2e harness — wraps mock provider + capability + helpers used
// by every flow file under `tests/e2e/`. The whole test matrix runs in
// one process with `bun test`; no real LLM endpoint is contacted.
//
// Imports cross workspaces via the path-mapped `@openseek/*` aliases.

import type { LLMProvider, OpenSeekMessage, ProviderCapability } from "@openseek/provider";
import type { AnyTool } from "@openseek/tool";
import type { StreamEvent } from "@openseek/session";
import { runSession } from "@openseek/session";
import {
  createMockModel,
  textChunks,
  thinkingThenTextChunks,
  toolCallChunks,
  type MockModelHandle,
  type PhaseScript,
} from "../../packages/session/src/mock-provider.ts";

export {
  createMockModel,
  textChunks,
  thinkingThenTextChunks,
  toolCallChunks,
  type MockModelHandle,
  type PhaseScript,
};

export function capability(over: Partial<ProviderCapability> = {}): ProviderCapability {
  return {
    contextWindow: 4096,
    maxOutput: 1024,
    supportsThinking: true,
    supportsCacheControl: false,
    supportsToolUse: true,
    payloadMode: "chat-completions",
    requiresReasoningReplay: false,
    ...over,
  };
}

export function fakeProvider(
  model: MockModelHandle["model"],
  id = "mock",
  protocol: "openai-compat" | "anthropic" | "google" = "openai-compat",
): LLMProvider {
  return {
    id,
    protocol,
    defaultModel: "mock-model",
    createClient: () => model,
    capability: () => capability(),
  };
}

export function userMsg(text: string): OpenSeekMessage {
  return { role: "user", content: [{ type: "text", text }] };
}

export async function drain<T>(gen: AsyncGenerator<T>): Promise<T[]> {
  const out: T[] = [];
  for await (const ev of gen) out.push(ev);
  return out;
}

export interface RunHarnessOpts {
  phases: PhaseScript[];
  tools?: Map<string, AnyTool>;
  cwd?: string;
  signal?: AbortSignal;
  mode?: "plan" | "agent" | "yolo";
  model?: string;
  providerId?: string;
  capabilityOver?: Partial<ProviderCapability>;
  prompt?: string;
}

export interface RunHarnessResult {
  events: StreamEvent[];
  handle: MockModelHandle;
  state: {
    messages: OpenSeekMessage[];
    mode: "plan" | "agent" | "yolo";
    reasoningEffort: "off" | "high" | "max";
    model: string;
    provider: string;
  };
}

/**
 * One-shot flow: build mock model with `phases`, run a single user turn,
 * collect StreamEvents.
 */
export async function runHarness(opts: RunHarnessOpts): Promise<RunHarnessResult> {
  const handle = createMockModel({ phases: opts.phases });
  const state = {
    messages: [userMsg(opts.prompt ?? "test prompt")],
    mode: opts.mode ?? ("agent" as const),
    reasoningEffort: "off" as const,
    model: opts.model ?? "mock-model",
    provider: opts.providerId ?? "mock",
  };
  const events = await drain(
    runSession(state, {
      provider: fakeProvider(handle.model, opts.providerId ?? "mock"),
      model: state.model,
      tools: opts.tools ?? new Map(),
      capability: capability(opts.capabilityOver),
      signal: opts.signal ?? new AbortController().signal,
      cwd: opts.cwd,
    }),
  );
  return { events, handle, state };
}
