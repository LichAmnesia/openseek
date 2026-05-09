import { expect, test } from "bun:test";
import { runBootSideEffects } from "../src/boot-side-effects.ts";
import type { TranscriptMessage } from "@openseek/tui";

test("boot side effects apply wallet and rows when still mounted", async () => {
  const rows: TranscriptMessage[] = [];
  const wallets: unknown[] = [];

  await runBootSideEffects({
    bootOpts: { apiKey: "sk-test", providerId: "mikan", skipSync: true },
    boot: async () => ({
      wallet: { balanceUsd: 3, usedUsd: 1 },
      locale: "en",
      messages: [{ id: "boot-1", kind: "system", text: "low wallet" }],
    }),
    setWalletBalance: (wallet) => wallets.push(wallet),
    appendMessages: (next) => rows.push(...next),
  });

  expect(wallets).toEqual([{ balanceUsd: 3, usedUsd: 1 }]);
  expect(rows).toEqual([{ id: "boot-1", kind: "system", text: "low wallet" }]);
});

test("boot side effects do nothing after mount disposal", async () => {
  const rows: TranscriptMessage[] = [];
  const wallets: unknown[] = [];

  await runBootSideEffects({
    bootOpts: { apiKey: "sk-test", providerId: "mikan", skipSync: true },
    boot: async () => ({
      wallet: { balanceUsd: 3, usedUsd: 1 },
      locale: "en",
      messages: [{ id: "boot-1", kind: "system", text: "low wallet" }],
    }),
    isDisposed: () => true,
    setWalletBalance: (wallet) => wallets.push(wallet),
    appendMessages: (next) => rows.push(...next),
  });

  expect(wallets).toEqual([]);
  expect(rows).toEqual([]);
});
