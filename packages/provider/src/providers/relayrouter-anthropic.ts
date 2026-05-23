// RelayRouter — Anthropic Messages protocol variant.
//
// Same host as the openai-compat `relayrouter` provider, but speaks native
// `/v1/messages`. The relay auto-dispatches by API key group: keys on
// "Claude 2x / 5.5x / AWS / Hermes / kiro" groups serve Anthropic
// protocol from this same endpoint (verified via the dashboard's
// "Use Key" → Claude Code tab, which prints
//   ANTHROPIC_BASE_URL="https://relayrouter.io"
//   ANTHROPIC_AUTH_TOKEN=sk-...
// ).
//
// Use this provider variant (not the openai-compat one) when the API key
// is on a Claude-class group — you get extended-thinking blocks and
// cache_control breakpoints with the proper wire shape instead of an
// openai-compat reshape.

import { createAnthropic } from "@ai-sdk/anthropic";
import type { LanguageModel } from "ai";
import type {
  LLMProvider,
  ProviderCapability,
  ProviderOpts,
} from "../types.ts";

const DEFAULT_BASE_URL = "https://relayrouter.io/v1";
const DEFAULT_MODEL = "claude-sonnet-4-6";

const CAPABILITY: ProviderCapability = {
  contextWindow: 200_000,
  maxOutput: 8_192,
  supportsThinking: true,
  supportsCacheControl: true,
  supportsToolUse: true,
  payloadMode: "anthropic-messages",
  requiresReasoningReplay: false,
};

const FAST_VARIANT_BY_MODEL: Readonly<Record<string, string>> = {
  "claude-opus-4-7": "claude-haiku-4-5",
  "claude-sonnet-4-6": "claude-haiku-4-5",
  "claude-sonnet-4-5": "claude-haiku-4-5",
};

export const relayrouterAnthropicProvider: LLMProvider = {
  id: "relayrouter-anthropic",
  protocol: "anthropic",
  defaultModel: DEFAULT_MODEL,
  availableModels: [
    { id: "claude-opus-4-7", label: "Claude Opus 4.7", description: "Frontier · Claude group (~5.5x)" },
    { id: "claude-sonnet-4-6", label: "Claude Sonnet 4.6", description: "Workhorse · Claude group (~2x)" },
    { id: "claude-sonnet-4-5", label: "Claude Sonnet 4.5", description: "Stable · Claude group (~2x)" },
    { id: "claude-haiku-4-5", label: "Claude Haiku 4.5", description: "Cheap · Claude group" },
  ],
  createClient(modelId, opts: ProviderOpts): LanguageModel {
    const sdk = createAnthropic({
      apiKey: opts.apiKey,
      baseURL: opts.baseURL ?? DEFAULT_BASE_URL,
      headers: opts.extraHeaders,
    });
    return sdk(modelId) as unknown as LanguageModel;
  },
  capability(modelId: string): ProviderCapability {
    const fastVariant = FAST_VARIANT_BY_MODEL[modelId];
    if (fastVariant) return { ...CAPABILITY, fastVariant };
    return CAPABILITY;
  },
};
