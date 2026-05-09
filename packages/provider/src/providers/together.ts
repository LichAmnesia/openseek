// Together AI — OpenAI-compat aggregator. Llama default, no replay.
import { createOpenAICompatProvider } from "../openai-compat.ts";

export const togetherProvider = createOpenAICompatProvider({
  id: "together",
  baseURL: "https://api.together.xyz/v1",
  defaultModel: "meta-llama/Meta-Llama-3.1-70B-Instruct-Turbo",
  requiresReasoningReplay: false,
  capability: {
    contextWindow: 128_000,
    maxOutput: 8_192,
    supportsThinking: false,
    supportsToolUse: true,
  },
});
