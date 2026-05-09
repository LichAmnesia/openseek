import { test, expect } from "bun:test";
import { isLowBalance, lowBalanceMessage } from "../src/wallet.ts";

// G6.3 — when wallet balance dips below $0.10, the cli should surface a
// system-channel charge prompt. We assert the predicate + the message
// builder; the actual injection lives in cli/interactive.ts.

test("isLowBalance triggers at $0.05", () => {
  expect(isLowBalance({ balanceUsd: 0.05, usedUsd: 0 })).toBe(true);
});

test("isLowBalance does not trigger at $5.00", () => {
  expect(isLowBalance({ balanceUsd: 5.0, usedUsd: 0 })).toBe(false);
});

test("lowBalanceMessage carries balance + topup URL", () => {
  const msg = lowBalanceMessage({ balanceUsd: 0.07, usedUsd: 12.34 });
  expect(msg).toContain("$0.07");
  expect(msg).toContain("https://mikancloud.com/billing");
});
