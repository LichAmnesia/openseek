// xAI Grok — OpenAI-compat. Grok models, no reasoning replay.
import { createOpenAICompatProvider } from "../openai-compat.ts";

export const xaiProvider = createOpenAICompatProvider({
  id: "xai",
  baseURL: "https://api.x.ai/v1",
  defaultModel: "grok-2-1212",
  requiresReasoningReplay: false,
  capability: {
    contextWindow: 131_072,
    maxOutput: 8_192,
    supportsThinking: false,
    supportsToolUse: true,
  },
});
