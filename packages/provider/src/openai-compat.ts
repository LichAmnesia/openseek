// Factory for OpenAI-compatible providers.
//
// 19 of OpenSeek's v0.5 providers speak the OpenAI Chat Completions wire
// protocol against different baseURLs. They all reuse @ai-sdk/openai-compatible
// underneath and only differ in: id, name, default baseURL, default model id,
// reasoning-replay flag, and a handful of capability numbers. This factory
// captures that shape so each provider file is just a tiny config object.

import { createOpenAICompatible } from "@ai-sdk/openai-compatible";
import type { LanguageModel } from "ai";
import type { LLMProvider, ProviderCapability, ProviderModelInfo, ProviderOpts } from "./types.ts";

export interface OpenAICompatFactoryOpts {
  /** Stable registry id (also used as the SDK's `name` field). */
  id: string;
  /** Default baseURL (overridable via ProviderOpts.baseURL). */
  baseURL: string;
  /** Default model id when caller does not specify one. */
  defaultModel: string;
  /** False for local/self-host endpoints that accept unauthenticated calls. */
  requiresApiKey?: boolean;
  /** Whether assistant tool_call messages must replay reasoning_content. */
  requiresReasoningReplay: boolean;
  /** Capability defaults. Optional fields fall back to safe defaults. */
  capability?: Partial<ProviderCapability>;
  /** Models exposed for picker UIs. Empty/undefined → free-text accepted. */
  availableModels?: ProviderModelInfo[];
  /**
   * Per-model `fastVariant` map for `/fast` (post-v1.0). Looked up by
   * exact model id; absent entries → no fast variant for that model.
   * Wrapping providers (mikan) can still override `capability()`
   * outright to layer per-model logic on top of this.
   */
  fastVariants?: Readonly<Record<string, string>>;
}

const DEFAULT_CAPABILITY: ProviderCapability = {
  contextWindow: 128_000,
  maxOutput: 8_192,
  supportsThinking: false,
  supportsCacheControl: false,
  supportsToolUse: true,
  payloadMode: "chat-completions",
  requiresReasoningReplay: false,
};

/**
 * Build a fully-formed `LLMProvider` for an OpenAI-compatible endpoint.
 *
 * The returned provider:
 *  - lazily constructs an @ai-sdk/openai-compatible chat client per call
 *    (cheap, and lets per-call `ProviderOpts.baseURL` overrides work)
 *  - returns a single `ProviderCapability` for every modelId — providers that
 *    need per-model capability tables can wrap this and override `capability`.
 */
export function createOpenAICompatProvider(opts: OpenAICompatFactoryOpts): LLMProvider {
  const cap: ProviderCapability = {
    ...DEFAULT_CAPABILITY,
    ...(opts.capability ?? {}),
    requiresReasoningReplay: opts.requiresReasoningReplay,
    payloadMode: "chat-completions",
  };

  return {
    id: opts.id,
    protocol: "openai-compat",
    requiresApiKey: opts.requiresApiKey ?? true,
    defaultModel: opts.defaultModel,
    availableModels: opts.availableModels,
    createClient(modelId, providerOpts: ProviderOpts): LanguageModel {
      const sdk = createOpenAICompatible({
        name: opts.id,
        baseURL: providerOpts.baseURL ?? opts.baseURL,
        apiKey: providerOpts.apiKey,
        headers: providerOpts.extraHeaders,
      });
      return sdk.chatModel(modelId) as unknown as LanguageModel;
    },
    capability(modelId: string): ProviderCapability {
      const variant = opts.fastVariants?.[modelId];
      if (variant) return { ...cap, fastVariant: variant };
      return cap;
    },
  };
}
