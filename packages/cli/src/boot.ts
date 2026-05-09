// Boot-time side effects for the interactive session (G6.2/G6.3/G6.5/G6.6).
//
// We keep the wallet check + sync round-trip out of `interactive.ts` so
// `runInteractive` stays focused on signal wiring + session events. Each
// function returns plain data so callers compose them into `TranscriptMessage`
// rows without the helper reaching back into TUI internals.

import {
  estimateCost,
  fetchWalletBalance,
  isLowBalance,
  lowBalanceMessage,
  syncSettings,
  type CostUsage,
  type WalletInfo,
} from "@openseek/provider";
import { detectLocale, t, type Locale } from "@openseek/tui";

export interface BootMessageRow {
  id: string;
  kind: "system";
  text: string;
}

export interface BootResult {
  wallet: WalletInfo | null;
  locale: Locale;
  messages: BootMessageRow[];
}

export interface BootOpts {
  apiKey: string;
  baseURL?: string;
  /**
   * Active provider id. When omitted we assume mikan (default). Wallet probe
   * runs only for mikan; non-mikan providers (deepseek.com / openai.com / etc)
   * don't have a `/v1/usage` schema we can read.
   */
  providerId?: string;
  /** Inject fetch for tests. */
  fetch?: typeof fetch;
  /** Inject locale detection (defaults to env). */
  env?: NodeJS.ProcessEnv;
  /** Skip the sync round-trip in tests we don't care about. */
  skipSync?: boolean;
}

let bootIdCounter = 0;
function bootId(prefix: string): string {
  bootIdCounter += 1;
  return `${prefix}-${Date.now()}-${bootIdCounter}`;
}

/**
 * Wallet endpoint is mikan-cloud specific. Probe only when the active
 * provider is mikan (default when providerId is unset, since the cli's
 * default provider is mikan-cloud). Non-mikan providers don't have a
 * `/v1/usage` schema so we skip the round-trip.
 */
function shouldProbeWallet(providerId?: string): boolean {
  if (!providerId) return true; // default cli provider is mikan
  return providerId === "mikan" || providerId === "mikan-cloud";
}

export async function bootInteractive(opts: BootOpts): Promise<BootResult> {
  const locale = detectLocale(opts.env ?? process.env);
  const messages: BootMessageRow[] = [];

  const wallet = shouldProbeWallet(opts.providerId)
    ? await fetchWalletBalance({
        apiKey: opts.apiKey,
        baseURL: opts.baseURL,
        fetch: opts.fetch,
      })
    : null;

  if (wallet && isLowBalance(wallet)) {
    messages.push({
      id: bootId("wallet-low"),
      kind: "system",
      text: `⚠️ ${t("wallet.low", locale)} — ${lowBalanceMessage(wallet)}`,
    });
  }

  if (!opts.skipSync) {
    try {
      const sync = await syncSettings(
        { /* settings payload reserved for v0.7 */ },
        { apiKey: opts.apiKey, baseURL: opts.baseURL, fetch: opts.fetch },
      );
      if (!sync.ok) {
        // silent — surfaced only via debug log
      }
    } catch {
      // best-effort
    }
  }

  return { wallet, locale, messages };
}

/** Cumulative cost across turns. Use `addCost` to fold a fresh usage snapshot. */
export interface CostState {
  totalUsd: number;
}

export function addCost(prev: CostState, usage: CostUsage, modelId: string): CostState {
  const delta = estimateCost(usage, modelId);
  return { totalUsd: prev.totalUsd + delta };
}

export function formatWalletStatus(wallet: WalletInfo | null, cost: CostState): string {
  const w = wallet ? `wallet:$${wallet.balanceUsd.toFixed(2)}` : "wallet:?";
  const c = `cost:$${cost.totalUsd.toFixed(4)}`;
  return `${w} ${c}`;
}
