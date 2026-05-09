// Custom OpenAI-compat endpoint — caller supplies baseURL via ProviderOpts.
// We register a stub default baseURL so the provider always boots; in
// practice every real call must override `opts.baseURL`.
import { createOpenAICompatProvider } from "../openai-compat.ts";

export const customProvider = createOpenAICompatProvider({
  id: "custom",
  baseURL: "http://localhost/v1",
  defaultModel: "custom-model",
  requiresReasoningReplay: false,
  capability: {
    contextWindow: 32_768,
    maxOutput: 4_096,
    supportsThinking: false,
    supportsToolUse: true,
  },
});
