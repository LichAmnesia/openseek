// Ollama local server — its OpenAI-compat shim runs on :11434/v1.
import { createOpenAICompatProvider } from "../openai-compat.ts";

export const ollamaProvider = createOpenAICompatProvider({
  id: "ollama",
  baseURL: "http://localhost:11434/v1",
  defaultModel: "llama3.2",
  requiresApiKey: false,
  requiresReasoningReplay: false,
  capability: {
    contextWindow: 32_768,
    maxOutput: 4_096,
    supportsThinking: false,
    supportsToolUse: true,
  },
});
