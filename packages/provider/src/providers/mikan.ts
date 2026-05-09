// mikan-cloud provider — OpenAI-compat gateway → DeepSeek V3.2/V4.
// Capability flag `requiresReasoningReplay: true` is the load-bearing bit:
// signals to the session/transform layer that assistant tool_call messages
// must replay `reasoning_content` on subsequent requests.

import { createOpenAICompatProvider } from "../openai-compat.ts";
import type { ProviderCapability } from "../types.ts";

const baseMikanProvider = createOpenAICompatProvider({
  id: "mikan",
  baseURL: "https://api.mikancloud.com/v1",
  defaultModel: "deepseek-v4-flash",
  requiresReasoningReplay: true,
  capability: {
    contextWindow: 1_000_000,
    maxOutput: 16_384,
    supportsThinking: true,
    supportsCacheControl: true,
    supportsToolUse: true,
  },
  availableModels: [
    {
      id: "deepseek-v4-flash",
      label: "DeepSeek V4 Flash",
      description: "1M ctx · $0.14/M in · workhorse",
    },
    {
      id: "deepseek-v4-pro",
      label: "DeepSeek V4 Pro",
      description: "1M ctx · $0.435/M in · frontier",
    },
    {
      id: "claude-sonnet-4-6",
      label: "Claude Sonnet 4.6",
      description: "Anthropic frontier · 200K ctx",
    },
    {
      id: "gpt-4o-mini",
      label: "GPT-4o mini",
      description: "OpenAI cheap workhorse",
    },
    {
      id: "gemini-3-flash-preview",
      label: "Gemini 3 Flash",
      description: "Google fast · 1M ctx",
    },
    {
      id: "gemini-3-pro-preview",
      label: "Gemini 3 Pro",
      description: "Google frontier · 1M ctx",
    },
    {
      id: "deepseek-chat",
      label: "DeepSeek Chat (legacy)",
      description: "Alias → routes upstream to v4-flash",
    },
  ],
});

// /fast → swap heavy / mid models to a cheap-fast sibling within the
// SAME provider (mikan). DeepSeek V4 Pro → V4 Flash mirrors the upstream
// deepseek provider; Claude Sonnet 4.6 → GPT-4o mini and Gemini 3 Pro →
// Gemini 3 Flash use the cheapest sibling mikan exposes for that family.
const MIKAN_FAST_VARIANTS: Readonly<Record<string, string>> = {
  "deepseek-v4-pro": "deepseek-v4-flash",
  "claude-sonnet-4-6": "gpt-4o-mini",
  "gemini-3-pro-preview": "gemini-3-flash-preview",
};

export const mikanProvider = {
  ...baseMikanProvider,
  capability(modelId: string): ProviderCapability {
    const base = baseMikanProvider.capability(modelId);
    const fastVariant = MIKAN_FAST_VARIANTS[modelId];
    const withFast = fastVariant ? { ...base, fastVariant } : base;
    if (isDeepSeekModel(modelId)) return withFast;
    if (modelId.startsWith("claude-")) {
      return {
        ...withFast,
        contextWindow: 200_000,
        maxOutput: 16_384,
        supportsThinking: false,
        supportsCacheControl: false,
        requiresReasoningReplay: false,
      };
    }
    if (modelId.startsWith("gpt-") || modelId.startsWith("o1") || modelId.startsWith("o3")) {
      return {
        ...withFast,
        contextWindow: 128_000,
        maxOutput: 16_384,
        supportsThinking: false,
        supportsCacheControl: false,
        requiresReasoningReplay: false,
      };
    }
    if (modelId.startsWith("gemini-")) {
      return {
        ...withFast,
        contextWindow: 1_000_000,
        maxOutput: 16_384,
        supportsThinking: true,
        supportsCacheControl: false,
        requiresReasoningReplay: false,
      };
    }
    return {
      ...withFast,
      supportsThinking: false,
      supportsCacheControl: false,
      requiresReasoningReplay: false,
    };
  },
};

function isDeepSeekModel(modelId: string): boolean {
  return modelId.startsWith("deepseek-");
}
