// Cerebras Cloud — OpenAI-compat. Llama default, no replay.
import { createOpenAICompatProvider } from "../openai-compat.ts";

export const cerebrasProvider = createOpenAICompatProvider({
  id: "cerebras",
  baseURL: "https://api.cerebras.ai/v1",
  defaultModel: "llama3.1-70b",
  requiresReasoningReplay: false,
  capability: {
    contextWindow: 128_000,
    maxOutput: 8_192,
    supportsThinking: false,
    supportsToolUse: true,
  },
});
