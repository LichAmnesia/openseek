// SGLang local inference server — OpenAI-compat shim. Replay on so DeepSeek
// weights served via SGLang behave correctly.
import { createOpenAICompatProvider } from "../openai-compat.ts";

export const sglangProvider = createOpenAICompatProvider({
  id: "sglang",
  baseURL: "http://localhost:30000/v1",
  defaultModel: "local",
  requiresApiKey: false,
  requiresReasoningReplay: true,
  capability: {
    contextWindow: 32_768,
    maxOutput: 4_096,
    supportsThinking: true,
    supportsToolUse: true,
  },
});
