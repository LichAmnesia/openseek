// Perplexity — OpenAI-compat. Sonar models, no reasoning replay.
import { createOpenAICompatProvider } from "../openai-compat.ts";

export const perplexityProvider = createOpenAICompatProvider({
  id: "perplexity",
  baseURL: "https://api.perplexity.ai",
  defaultModel: "sonar",
  requiresReasoningReplay: false,
  capability: {
    contextWindow: 128_000,
    maxOutput: 8_192,
    supportsThinking: false,
    supportsToolUse: false,
  },
});
