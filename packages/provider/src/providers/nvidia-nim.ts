// NVIDIA NIM — OpenAI-compat. DeepSeek-V3 NIM SKU exposes reasoning, replay on.
import { createOpenAICompatProvider } from "../openai-compat.ts";

export const nvidiaNimProvider = createOpenAICompatProvider({
  id: "nvidia-nim",
  baseURL: "https://integrate.api.nvidia.com/v1",
  defaultModel: "deepseek-ai/deepseek-v3",
  requiresReasoningReplay: true,
  capability: {
    contextWindow: 128_000,
    maxOutput: 8_192,
    supportsThinking: true,
    supportsToolUse: true,
  },
});
