// e2e: wallet flow (G7.2 #10).
// Mocked fetch, no network.

import { describe, expect, test } from "bun:test";
import {
  fetchWalletBalance,
  formatBalance,
  isLowBalance,
  lowBalanceMessage,
} from "@openseek/provider";

describe("e2e: wallet flow", () => {
  test("fetchWalletBalance returns parsed shape from mock fetch", async () => {
    const fakeFetch = (async (_url: string) => {
      return new Response(JSON.stringify({ balance_usd: 4.21, used_usd: 0.79 }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    }) as typeof fetch;
    const info = await fetchWalletBalance({ apiKey: "sk-test", fetch: fakeFetch });
    expect(info).not.toBeNull();
    expect(info?.balanceUsd).toBeCloseTo(4.21);
    expect(formatBalance(info)).toContain("$4.21");
    expect(isLowBalance(info)).toBe(false);
  });

  test("low-balance prompt fires when balance < threshold", () => {
    const low = { balanceUsd: 0.05, usedUsd: 0.95 };
    expect(isLowBalance(low)).toBe(true);
    expect(lowBalanceMessage(low)).toContain("low wallet");
    expect(lowBalanceMessage(low)).toContain("$0.05");
  });
});
