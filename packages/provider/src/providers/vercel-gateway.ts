// Vercel AI Gateway — OpenAI-compat aggregator. Default routes to gpt-4o.
import { createOpenAICompatProvider } from "../openai-compat.ts";

export const vercelGatewayProvider = createOpenAICompatProvider({
  id: "vercel-gateway",
  baseURL: "https://gateway.ai.vercel.com/v1",
  defaultModel: "openai/gpt-4o",
  requiresReasoningReplay: false,
  capability: {
    contextWindow: 128_000,
    maxOutput: 8_192,
    supportsThinking: false,
    supportsToolUse: true,
  },
});
