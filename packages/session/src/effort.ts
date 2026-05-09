// Reasoning-effort + usage-snapshot helpers shared by run.ts (G2.6 + G2.8).
//
// Kept as pure functions so they're trivially unit-testable and so run.ts
// stays focused on the streaming loop body.

import type { LanguageModelUsage } from "ai";
import type { ReasoningEffort, UsageSnapshot } from "./types.ts";

/**
 * Build the `providerOptions` blob ai-SDK forwards to the upstream provider.
 * Reasoning effort lands under both `openai` and `deepseek` keys — providers
 * that don't recognise the key silently ignore it (G2.6). `"off"` returns
 * an empty blob so providers don't see a pseudo-value.
 */
export function buildProviderOptions(
  effort: ReasoningEffort,
): Record<string, Record<string, string>> {
  if (effort === "off") return {};
  return {
    openai: { reasoningEffort: effort },
    deepseek: { reasoningEffort: effort },
  };
}

/**
 * Translate ai-SDK's `LanguageModelUsage` into our trimmed `UsageSnapshot`.
 * Returns null when the provider supplied no usage info at all so the run
 * loop can skip emitting a noisy usage-update event (G2.8).
 */
export function toUsageSnapshot(usage: LanguageModelUsage): UsageSnapshot | null {
  // biome-ignore lint/suspicious/noExplicitAny: cachedInputTokens key isn't on the public LanguageModelUsage type.
  const u = usage as any;
  const totalIn = numOr(u.inputTokens, 0);
  const totalOut = numOr(u.outputTokens, 0);
  const cacheRead = numOr(u.cachedInputTokens, undefined);
  const cacheCreation = numOr(u.cacheCreationInputTokens, undefined);
  if (totalIn === 0 && totalOut === 0 && cacheRead === undefined && cacheCreation === undefined) {
    return null;
  }
  const snap: UsageSnapshot = { totalIn, totalOut };
  if (cacheRead !== undefined) snap.cacheRead = cacheRead;
  if (cacheCreation !== undefined) snap.cacheCreation = cacheCreation;
  return snap;
}

function numOr<T>(v: unknown, fallback: T): number | T {
  return typeof v === "number" && Number.isFinite(v) ? v : fallback;
}
