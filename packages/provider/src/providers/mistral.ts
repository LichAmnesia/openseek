// Mistral — OpenAI-compat. Mistral models, no reasoning replay.
import { createOpenAICompatProvider } from "../openai-compat.ts";

export const mistralProvider = createOpenAICompatProvider({
  id: "mistral",
  baseURL: "https://api.mistral.ai/v1",
  defaultModel: "mistral-small-latest",
  requiresReasoningReplay: false,
  capability: {
    contextWindow: 128_000,
    maxOutput: 8_192,
    supportsThinking: false,
    supportsToolUse: true,
  },
});
