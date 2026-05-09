// DeepSeek (China endpoint) — OpenAI-compat with reasoning replay.
//
// F5 P1 SECURITY: pre-fix, baseURL was `https://api.deepseeki.com` (extra
// `i`). That domain is not owned by DeepSeek — typing an API key into the
// `deepseek-cn` provider would have leaked the key to a third party.
//
// DeepSeek's primary API at `api.deepseek.com` already serves both intl
// and CN regions; there is no separate `*.deepseek.cn` host as of 2026-05.
// We point this provider at the real DeepSeek API and keep the id around
// for users with an existing config so their setup keeps working.
import { createOpenAICompatProvider } from "../openai-compat.ts";

export const deepseekCnProvider = createOpenAICompatProvider({
  id: "deepseek-cn",
  baseURL: "https://api.deepseek.com",
  defaultModel: "deepseek-v4-flash",
  requiresReasoningReplay: true,
  capability: {
    contextWindow: 1_000_000,
    maxOutput: 8_192,
    supportsThinking: true,
    supportsToolUse: true,
  },
  // /fast → drop V4 Pro down to V4 Flash for the next turn (mirrors
  // the international `deepseek` provider).
  fastVariants: {
    "deepseek-v4-pro": "deepseek-v4-flash",
  },
});
