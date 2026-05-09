// DeepInfra — OpenAI-compat. DeepSeek-V3 SKU preserves reasoning, replay on.
import { createOpenAICompatProvider } from "../openai-compat.ts";

export const deepinfraProvider = createOpenAICompatProvider({
  id: "deepinfra",
  baseURL: "https://api.deepinfra.com/v1/openai",
  defaultModel: "deepseek-ai/DeepSeek-V3",
  requiresReasoningReplay: true,
  capability: {
    contextWindow: 128_000,
    maxOutput: 8_192,
    supportsThinking: true,
    supportsToolUse: true,
  },
});
