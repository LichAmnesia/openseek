// Cohere (compatibility endpoint) — OpenAI-compat. Command R+ default.
import { createOpenAICompatProvider } from "../openai-compat.ts";

export const cohereProvider = createOpenAICompatProvider({
  id: "cohere",
  baseURL: "https://api.cohere.com/compatibility/v1",
  defaultModel: "command-r-plus",
  requiresReasoningReplay: false,
  capability: {
    contextWindow: 128_000,
    maxOutput: 4_096,
    supportsThinking: false,
    supportsToolUse: true,
  },
});
