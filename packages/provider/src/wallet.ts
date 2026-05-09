// Mikan-cloud wallet balance fetcher (G6.2 + G6.3).
//
// We hit `GET /v1/usage` on the gateway with the user's Bearer key and parse
// `{ balance_usd, used_usd }`. Network or 4xx errors return `null` so the
// caller can degrade gracefully — wallet display is best-effort, not load-
// bearing for the chat path.
//
// `fetch` is injectable so tests can mock it without spinning a real server.

import { timeoutSignal } from "./fetch-timeout.ts";

export interface WalletInfo {
  balanceUsd: number;
  usedUsd: number;
}

export interface WalletClientOpts {
  apiKey: string;
  baseURL?: string;
  fetch?: typeof fetch;
  timeoutMs?: number;
}

const DEFAULT_BASE = "https://api.mikancloud.com/v1";

const LOW_BALANCE_THRESHOLD = 0.1;

/** Returns true if the wallet is below the top-up nag threshold. */
export function isLowBalance(info: WalletInfo | null): boolean {
  if (!info) return false;
  return info.balanceUsd < LOW_BALANCE_THRESHOLD;
}

export function formatBalance(info: WalletInfo | null): string {
  if (!info) return "wallet:?";
  return `wallet:$${info.balanceUsd.toFixed(2)}`;
}

export function lowBalanceMessage(info: WalletInfo): string {
  return `low wallet ($${info.balanceUsd.toFixed(2)}), top up at https://mikancloud.com/billing`;
}

export async function fetchWalletBalance(opts: WalletClientOpts): Promise<WalletInfo | null> {
  const f = opts.fetch ?? globalThis.fetch;
  const base = (opts.baseURL ?? DEFAULT_BASE).replace(/\/$/, "");
  if (!opts.apiKey) return null;
  try {
    const res = await f(`${base}/usage`, {
      method: "GET",
      headers: {
        Authorization: `Bearer ${opts.apiKey}`,
        Accept: "application/json",
      },
      signal: timeoutSignal(opts.timeoutMs),
    });
    if (!res.ok) return null;
    const body = (await res.json()) as Partial<{
      balance_usd: number;
      used_usd: number;
      balanceUsd: number;
      usedUsd: number;
    }>;
    const balance = body.balance_usd ?? body.balanceUsd;
    const used = body.used_usd ?? body.usedUsd ?? 0;
    if (typeof balance !== "number") return null;
    return { balanceUsd: balance, usedUsd: typeof used === "number" ? used : 0 };
  } catch {
    return null;
  }
}

export const _internals = { LOW_BALANCE_THRESHOLD, DEFAULT_BASE };
