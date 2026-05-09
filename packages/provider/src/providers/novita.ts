// Novita AI — OpenAI-compat. DeepSeek SKUs preserve reasoning_content.
import { createOpenAICompatProvider } from "../openai-compat.ts";

export const novitaProvider = createOpenAICompatProvider({
  id: "novita",
  baseURL: "https://api.novita.ai/v3/openai",
  defaultModel: "deepseek/deepseek-v3",
  requiresReasoningReplay: true,
  capability: {
    contextWindow: 128_000,
    maxOutput: 8_192,
    supportsThinking: true,
    supportsToolUse: true,
  },
});
