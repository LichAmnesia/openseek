// Fireworks AI — OpenAI-compat. DeepSeek SKUs hosted there preserve the
// reasoning_content channel, so we flip the replay flag on.
import { createOpenAICompatProvider } from "../openai-compat.ts";

export const fireworksProvider = createOpenAICompatProvider({
  id: "fireworks",
  baseURL: "https://api.fireworks.ai/inference/v1",
  defaultModel: "accounts/fireworks/models/deepseek-v3",
  requiresReasoningReplay: true,
  capability: {
    contextWindow: 131_072,
    maxOutput: 8_192,
    supportsThinking: true,
    supportsToolUse: true,
  },
});
