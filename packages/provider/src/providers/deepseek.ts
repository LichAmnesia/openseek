// DeepSeek (international endpoint) — OpenAI-compat with reasoning replay.
import { createOpenAICompatProvider } from "../openai-compat.ts";

export const deepseekProvider = createOpenAICompatProvider({
  id: "deepseek",
  baseURL: "https://api.deepseek.com",
  defaultModel: "deepseek-v4-flash",
  requiresReasoningReplay: true,
  capability: {
    contextWindow: 1_000_000,
    maxOutput: 8_192,
    supportsThinking: true,
    supportsToolUse: true,
  },
  availableModels: [
    { id: "deepseek-v4-flash", label: "DeepSeek V4 Flash", description: "1M ctx · workhorse" },
    { id: "deepseek-v4-pro", label: "DeepSeek V4 Pro", description: "1M ctx · frontier" },
    { id: "deepseek-reasoner", label: "DeepSeek R1", description: "Reasoning model" },
    { id: "deepseek-chat", label: "DeepSeek Chat (legacy)", description: "Alias → v4-flash" },
  ],
  // /fast → drop V4 Pro down to V4 Flash for the next turn. R1 + Flash
  // are already cheap; no fast variant needed.
  fastVariants: {
    "deepseek-v4-pro": "deepseek-v4-flash",
  },
});
