// vLLM local inference server — OpenAI-compat shim. No reasoning replay
// (most vLLM-served weights do not surface reasoning_content).
import { createOpenAICompatProvider } from "../openai-compat.ts";

export const vllmProvider = createOpenAICompatProvider({
  id: "vllm",
  baseURL: "http://localhost:8000/v1",
  defaultModel: "local",
  requiresApiKey: false,
  requiresReasoningReplay: false,
  capability: {
    contextWindow: 32_768,
    maxOutput: 4_096,
    supportsThinking: false,
    supportsToolUse: true,
  },
});
