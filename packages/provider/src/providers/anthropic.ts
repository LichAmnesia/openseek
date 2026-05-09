// Anthropic direct provider — Messages API.
// payloadMode "anthropic-messages" signals to the protocol shim that outbound
// messages should be encoded as Anthropic content blocks rather than OpenAI
// chat completions. requiresReasoningReplay is false: Anthropic exposes
// extended-thinking blocks directly and does not have DeepSeek's quirk.

import { createAnthropic } from "@ai-sdk/anthropic";
import type { LanguageModel } from "ai";
import type {
  LLMProvider,
  ProviderCapability,
  ProviderOpts,
} from "../types.ts";

const DEFAULT_BASE_URL = "https://api.anthropic.com/v1";
const DEFAULT_MODEL = "claude-sonnet-4-5";

const ANTHROPIC_CAPABILITY: ProviderCapability = {
  contextWindow: 200_000,
  maxOutput: 8_192,
  supportsThinking: true,
  supportsCacheControl: true,
  supportsToolUse: true,
  payloadMode: "anthropic-messages",
  requiresReasoningReplay: false,
};

// /fast → swap heavy frontier models to Haiku for the next turn. Sonnet 4.5
// already IS the workhorse; routing it to Haiku saves cost when the user
// just wants a quick reply. Haiku has no smaller sibling, so the toggle
// is a no-op there.
const FAST_VARIANT_BY_MODEL: Readonly<Record<string, string>> = {
  "claude-opus-4-7": "claude-haiku-4-5",
  "claude-sonnet-4-6": "claude-haiku-4-5",
  "claude-sonnet-4-5": "claude-haiku-4-5",
};

export const anthropicProvider: LLMProvider = {
  id: "anthropic",
  protocol: "anthropic",
  defaultModel: DEFAULT_MODEL,
  availableModels: [
    { id: "claude-opus-4-7", label: "Claude Opus 4.7", description: "Frontier · long context" },
    { id: "claude-sonnet-4-6", label: "Claude Sonnet 4.6", description: "Workhorse · 200K ctx" },
    { id: "claude-sonnet-4-5", label: "Claude Sonnet 4.5", description: "Stable" },
    { id: "claude-haiku-4-5", label: "Claude Haiku 4.5", description: "Fast · cheap" },
  ],
  createClient(modelId, opts: ProviderOpts): LanguageModel {
    const sdk = createAnthropic({
      apiKey: opts.apiKey,
      baseURL: opts.baseURL ?? DEFAULT_BASE_URL,
      headers: opts.extraHeaders,
    });
    // Cast bridges the SDK's narrowed generic to the public LanguageModel
    // union — structurally identical at runtime.
    return sdk(modelId) as unknown as LanguageModel;
  },
  capability(modelId: string): ProviderCapability {
    const fastVariant = FAST_VARIANT_BY_MODEL[modelId];
    if (fastVariant) return { ...ANTHROPIC_CAPABILITY, fastVariant };
    return ANTHROPIC_CAPABILITY;
  },
};
