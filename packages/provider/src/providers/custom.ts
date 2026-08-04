// Custom OpenAI-compat endpoint — caller supplies baseURL via ProviderOpts.
// We register a stub default baseURL so the provider always boots; in
// practice every real call must override `opts.baseURL`.
import { createOpenAICompatProvider } from "../openai-compat.ts";

export const customProvider = createOpenAICompatProvider({
  id: "custom",
  baseURL: "http://localhost/v1",
  defaultModel: "custom-model",
  // Self-host endpoints (llama-server / LM Studio / …) often run without
  // auth — an empty apiKey must not block the request. Endpoints that DO
  // require a key still work: the user just fills it in.
  requiresApiKey: false,
  requiresBaseURL: true,
  requiresReasoningReplay: false,
  capability: {
    contextWindow: 32_768,
    maxOutput: 4_096,
    supportsThinking: false,
    supportsToolUse: true,
  },
});
