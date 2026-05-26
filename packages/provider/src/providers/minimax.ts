// MiniMax (海螺 / abab) — OpenAI-compat against api.minimax.io.
// MiniMax ships an OpenAI-compatible Chat Completions endpoint at
// `https://api.minimax.io/v1` (intl) or `https://api.minimaxi.com/v1` (CN).
// No reasoning-replay quirk — M2.7 is a vanilla chat model.
//
// Auth: Bearer <MINIMAX_API_KEY>. Default to the intl host; CN users can
// override via MINIMAX_BASE_URL / config.

import { createOpenAICompatProvider } from "../openai-compat.ts";
import type { ProviderCapability } from "../types.ts";

const baseMinimaxProvider = createOpenAICompatProvider({
  id: "minimax",
  baseURL: "https://api.minimax.io/v1",
  defaultModel: "MiniMax-M2.7",
  requiresReasoningReplay: false,
  capability: {
    contextWindow: 204_800,
    maxOutput: 192_000,
    supportsThinking: false,
    supportsCacheControl: false,
    supportsToolUse: true,
  },
  availableModels: [
    {
      id: "MiniMax-M2.7",
      label: "MiniMax M2.7",
      description: "Frontier · 204K ctx · peak performance",
    },
    {
      id: "MiniMax-M2.7-highspeed",
      label: "MiniMax M2.7 highspeed",
      description: "Same model · faster · 204K ctx",
    },
  ],
  // /fast → swap the frontier M2.7 down to the highspeed sibling for the
  // next turn. Latency drop with no model swap. Highspeed itself has no
  // faster sibling, so the toggle is a no-op there.
  fastVariants: {
    "MiniMax-M2.7": "MiniMax-M2.7-highspeed",
  },
});

// MiniMax quirk: `temperature` must be in (0, 1] — values outside the
// range (including the OpenAI-style 0) get rejected. We surface that as a
// capability comment rather than a runtime clamp since the picker doesn't
// own per-turn sampling parameters; callers passing temperature=0 will get
// a server-side 4xx, which is the right signal.
export const minimaxProvider = baseMinimaxProvider;

// Re-exported capability accessor for downstream packages that want to
// inspect M2.7 vs highspeed without going through `listProviders()`.
export function minimaxCapability(modelId: string): ProviderCapability {
  return baseMinimaxProvider.capability(modelId);
}
