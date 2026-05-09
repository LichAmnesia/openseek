// OpenAI provider — OpenAI-compat against api.openai.com.
// Used as the no-reasoning-replay control for the transform layer.

import { createOpenAICompatProvider } from "../openai-compat.ts";

export const openaiProvider = createOpenAICompatProvider({
  id: "openai",
  baseURL: "https://api.openai.com/v1",
  defaultModel: "gpt-4o",
  requiresReasoningReplay: false,
  capability: {
    contextWindow: 128_000,
    maxOutput: 16_384,
    supportsThinking: false,
    supportsCacheControl: false,
    supportsToolUse: true,
  },
  availableModels: [
    { id: "gpt-5.2", label: "GPT-5.2", description: "OpenAI frontier" },
    { id: "gpt-4o", label: "GPT-4o", description: "Workhorse · 128K ctx" },
    { id: "gpt-4o-mini", label: "GPT-4o mini", description: "Cheap · fast" },
  ],
  // /fast → drop frontier / workhorse down to the cheap-fast sibling.
  fastVariants: {
    "gpt-5.2": "gpt-4o-mini",
    "gpt-4o": "gpt-4o-mini",
  },
});
