// OpenRouter — OpenAI-compat aggregator. Default DeepSeek route, replay on.
import { createOpenAICompatProvider } from "../openai-compat.ts";

// availableModels is empty: openrouter is a meta-router with thousands of
// model ids. The picker UI should accept free-text instead.
export const openrouterProvider = createOpenAICompatProvider({
  id: "openrouter",
  baseURL: "https://openrouter.ai/api/v1",
  defaultModel: "deepseek/deepseek-chat",
  requiresReasoningReplay: true,
  capability: {
    contextWindow: 128_000,
    maxOutput: 8_192,
    supportsThinking: true,
    supportsToolUse: true,
  },
});
