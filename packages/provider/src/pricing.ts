// Per-model pricing table for cost estimation (G6.4).
//
// USD per 1,000,000 tokens. `cachedInput` is the discounted rate applied to
// `cacheRead` tokens (Anthropic / DeepSeek prefix-cache hits). `output`
// covers completion tokens.
//
// Numbers come from each provider's published pricing pages and are
// approximate — we round to 2 decimals where the official page does.
// `estimateCost` falls back to 0 for unknown model ids.

// Local mirror of `UsageSnapshot` so we don't pull session-package types
// (avoid circular workspace dep — session already depends on provider).
export interface CostUsage {
  totalIn: number;
  totalOut: number;
  cacheCreation?: number;
  cacheRead?: number;
}

export interface ModelPricing {
  /** USD per 1M input (uncached) tokens. */
  input: number;
  /** USD per 1M input tokens served from cache. */
  cachedInput: number;
  /** USD per 1M output tokens. */
  output: number;
}

/** Lookup table — id can be vendor-prefixed ("mikan/deepseek-chat") or raw. */
export const PRICING: Record<string, ModelPricing> = {
  // ---------- DeepSeek family ----------
  // V4 Flash — 1M ctx workhorse (mikan picker default). Source: mikan-cloud
  // pricing table mirrors deepseek.com direct pricing for v4-flash.
  "deepseek-v4-flash": { input: 0.14, cachedInput: 0.035, output: 0.28 },
  "mikan/deepseek-v4-flash": { input: 0.14, cachedInput: 0.035, output: 0.28 },
  // V4 Pro — frontier 1M-ctx tier.
  "deepseek-v4-pro": { input: 0.435, cachedInput: 0.11, output: 0.87 },
  "mikan/deepseek-v4-pro": { input: 0.435, cachedInput: 0.11, output: 0.87 },
  // legacy aliases — deepseek-chat now routes upstream to v4-flash, but the
  // historical PRICING numbers (0.27 / 1.10) are kept for callers that still
  // pass the old id.
  "mikan/deepseek-chat": { input: 0.27, cachedInput: 0.07, output: 1.1 },
  "deepseek-chat": { input: 0.27, cachedInput: 0.07, output: 1.1 },
  // R1 reasoner — DeepSeek published rate.
  "mikan/deepseek-reasoner": { input: 0.55, cachedInput: 0.14, output: 2.19 },
  "deepseek-reasoner": { input: 0.55, cachedInput: 0.14, output: 2.19 },

  // ---------- OpenAI family ----------
  // TODO: confirm GPT-5.2 pricing — Anthropic-matched placeholder pending
  // OpenAI's public rate card for gpt-5.2.
  "gpt-5.2": { input: 5.0, cachedInput: 1.25, output: 15.0 },
  "gpt-4o": { input: 2.5, cachedInput: 1.25, output: 10.0 },
  "gpt-4o-mini": { input: 0.15, cachedInput: 0.075, output: 0.6 },

  // ---------- Anthropic Claude family ----------
  // Anthropic has held sonnet pricing stable at $3/$15 across 4.5 → 4.6.
  // TODO: confirm Opus 4.7 + Haiku 4.5 — placeholders mirror the most
  // recently announced tier shapes (Opus = ~5x sonnet input, Haiku ~1/3).
  "claude-opus-4-7": { input: 15.0, cachedInput: 1.5, output: 75.0 },
  "claude-sonnet-4-6": { input: 3.0, cachedInput: 0.3, output: 15.0 },
  "claude-sonnet-4-5": { input: 3.0, cachedInput: 0.3, output: 15.0 },
  "claude-haiku-4-5": { input: 1.0, cachedInput: 0.1, output: 5.0 },
  // mikan vendor-prefixed mirrors (mikan picker exposes claude-sonnet-4-6).
  "mikan/claude-sonnet-4-6": { input: 3.0, cachedInput: 0.3, output: 15.0 },
  "mikan/gpt-4o-mini": { input: 0.15, cachedInput: 0.075, output: 0.6 },
  // legacy/3.5 family kept so older transcripts still cost correctly.
  "claude-3-5-sonnet-latest": { input: 3.0, cachedInput: 0.3, output: 15.0 },
  "claude-3-5-haiku-latest": { input: 0.8, cachedInput: 0.08, output: 4.0 },

  // ---------- Google Gemini family ----------
  // TODO: confirm Gemini 3 preview pricing — mirrors current 2.0-flash /
  // 1.5-pro shape with conservative bumps.
  "gemini-3-flash-preview": { input: 0.075, cachedInput: 0.01875, output: 0.3 },
  "gemini-3-pro-preview": { input: 1.25, cachedInput: 0.3125, output: 5.0 },
  "mikan/gemini-3-flash-preview": { input: 0.075, cachedInput: 0.01875, output: 0.3 },
  "mikan/gemini-3-pro-preview": { input: 1.25, cachedInput: 0.3125, output: 5.0 },
  "gemini-2.0-flash": { input: 0.1, cachedInput: 0.025, output: 0.4 },
  "gemini-2.0-flash-exp": { input: 0.1, cachedInput: 0.025, output: 0.4 },
  "gemini-1.5-pro": { input: 1.25, cachedInput: 0.3125, output: 5.0 },

  // ---------- F5 P1: Groq family (Llama / Mixtral) ----------
  // TODO: confirm Groq's published rates. Groq's free-tier exposes these
  // for $0/$0; paid tier has token-billing per its pricing page (subject to
  // change). Set to 0/0 for now so the cost meter doesn't fabricate numbers
  // — the explicit $0 mirrors Groq's free-tier marketing.
  "llama-3.3-70b-versatile": { input: 0, cachedInput: 0, output: 0 },
  "llama-3.1-8b-instant": { input: 0, cachedInput: 0, output: 0 },
  "mixtral-8x7b-32768": { input: 0, cachedInput: 0, output: 0 },

  // ---------- F5 P1: Cerebras (Llama 3.1) ----------
  // TODO: confirm cerebras.ai pricing. Mirrors Groq free-tier shape.
  "llama3.1-70b": { input: 0, cachedInput: 0, output: 0 },

  // ---------- F5 P1: Mistral ----------
  // TODO: confirm mistral.ai/pricing. mistral-small-latest is the default
  // picker entry; numbers below are the Mistral published Small tier rate.
  "mistral-small-latest": { input: 0.2, cachedInput: 0.05, output: 0.6 },
  "mistral-large-latest": { input: 2.0, cachedInput: 0.5, output: 6.0 },

  // ---------- F5 P1: xAI Grok ----------
  // TODO: confirm x.ai/api pricing. grok-2-1212 is the current default; the
  // ~$5/$15 numbers track Grok 4.1 Fast as the critic instructed.
  "grok-2-1212": { input: 5.0, cachedInput: 1.25, output: 15.0 },
  "grok-4-1-fast": { input: 5.0, cachedInput: 1.25, output: 15.0 },

  // ---------- F5 P1: Cohere Command R+ ----------
  // TODO: confirm cohere.com/pricing. $2.50 / $10 per M is the public rate.
  "command-r-plus": { input: 2.5, cachedInput: 0.625, output: 10.0 },

  // ---------- F5 P1: Perplexity Sonar ----------
  // TODO: confirm perplexity.ai/pricing. Sonar tier is roughly $1/$1 per M.
  sonar: { input: 1.0, cachedInput: 0.25, output: 1.0 },
};

const PER_MILLION = 1_000_000;

export function getPricing(modelId: string): ModelPricing | null {
  return PRICING[modelId] ?? PRICING[modelId.toLowerCase()] ?? null;
}

// One-shot warning: surface unknown model ids exactly once per process so the
// regression surfaces fast in CI / dev runs instead of hiding behind silent
// $0.00 cost-bar values.
const _warnedUnknownModels = new Set<string>();
function warnUnknownModelOnce(modelId: string): void {
  if (_warnedUnknownModels.has(modelId)) return;
  _warnedUnknownModels.add(modelId);
  // Use stderr — TUI owns stdout. Tests can monkey-patch console.warn if needed.
  // biome-ignore lint/suspicious/noConsole: intentional one-time diagnostic.
  console.warn(
    `[openseek/pricing] no PRICING entry for model id "${modelId}" — cost reported as $0.00. Add an entry in packages/provider/src/pricing.ts.`,
  );
}

/** Test-only hook to reset the warned-once set between tests. */
export function _resetPricingWarnings(): void {
  _warnedUnknownModels.clear();
}

/**
 * Estimate USD cost for a single turn given a usage snapshot. Cache reads
 * are billed at the cheaper `cachedInput` rate; the residual non-cache input
 * is `totalIn - cacheRead`.
 */
export function estimateCost(usage: CostUsage, modelId: string): number {
  const p = getPricing(modelId);
  if (!p) {
    warnUnknownModelOnce(modelId);
    return 0;
  }
  const cacheRead = usage.cacheRead ?? 0;
  const uncachedIn = Math.max(usage.totalIn - cacheRead, 0);
  const inputCost = (uncachedIn * p.input) / PER_MILLION;
  const cachedCost = (cacheRead * p.cachedInput) / PER_MILLION;
  const outputCost = (usage.totalOut * p.output) / PER_MILLION;
  const total = inputCost + cachedCost + outputCost;
  return Math.round(total * 1_000_000) / 1_000_000;
}

export function formatCost(usd: number): string {
  if (usd <= 0) return "$0.00";
  if (usd < 0.01) return `$${usd.toFixed(4)}`;
  return `$${usd.toFixed(2)}`;
}
