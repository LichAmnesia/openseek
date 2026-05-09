// Groq — OpenAI-compat. Llama models, no reasoning replay.
import { createOpenAICompatProvider } from "../openai-compat.ts";

export const groqProvider = createOpenAICompatProvider({
  id: "groq",
  baseURL: "https://api.groq.com/openai/v1",
  defaultModel: "llama-3.3-70b-versatile",
  requiresReasoningReplay: false,
  capability: {
    contextWindow: 128_000,
    maxOutput: 8_192,
    supportsThinking: false,
    supportsToolUse: true,
  },
  availableModels: [
    { id: "llama-3.3-70b-versatile", label: "Llama 3.3 70B" },
    { id: "llama-3.1-8b-instant", label: "Llama 3.1 8B Instant" },
    { id: "mixtral-8x7b-32768", label: "Mixtral 8x7B" },
  ],
});
