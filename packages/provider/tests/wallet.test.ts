import { test, expect } from "bun:test";
import {
  fetchWalletBalance,
  formatBalance,
  isLowBalance,
  lowBalanceMessage,
} from "../src/wallet.ts";

function mockFetch(handler: (req: Request) => Response | Promise<Response>): typeof fetch {
  return ((input: Request | URL | string, init?: RequestInit) => {
    const req = input instanceof Request ? input : new Request(String(input), init);
    return Promise.resolve(handler(req));
  }) as unknown as typeof fetch;
}

test("fetchWalletBalance returns parsed { balanceUsd, usedUsd } on 200", async () => {
  const seenAuth: string[] = [];
  const f = mockFetch((req) => {
    const a = req.headers.get("Authorization");
    if (a) seenAuth.push(a);
    return new Response(JSON.stringify({ balance_usd: 12.5, used_usd: 3.25 }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  });
  const out = await fetchWalletBalance({ apiKey: "sk-x", fetch: f });
  expect(out).toEqual({ balanceUsd: 12.5, usedUsd: 3.25 });
  expect(seenAuth[0]).toBe("Bearer sk-x");
});

test("fetchWalletBalance returns null on 401", async () => {
  const f = mockFetch(() => new Response("unauthorized", { status: 401 }));
  const out = await fetchWalletBalance({ apiKey: "bad", fetch: f });
  expect(out).toBeNull();
});

test("fetchWalletBalance returns null on network throw", async () => {
  const f = (() => {
    throw new Error("dns fail");
  }) as unknown as typeof fetch;
  const out = await fetchWalletBalance({ apiKey: "sk-x", fetch: f });
  expect(out).toBeNull();
});

test("fetchWalletBalance returns null when apiKey empty", async () => {
  const f = mockFetch(
    () =>
      new Response(JSON.stringify({ balance_usd: 1 }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }),
  );
  const out = await fetchWalletBalance({ apiKey: "", fetch: f });
  expect(out).toBeNull();
});

test("isLowBalance threshold = $0.10", () => {
  expect(isLowBalance({ balanceUsd: 0.05, usedUsd: 0 })).toBe(true);
  expect(isLowBalance({ balanceUsd: 0.1, usedUsd: 0 })).toBe(false);
  expect(isLowBalance({ balanceUsd: 5, usedUsd: 0 })).toBe(false);
  expect(isLowBalance(null)).toBe(false);
});

test("formatBalance / lowBalanceMessage produce stable strings", () => {
  expect(formatBalance({ balanceUsd: 12.345, usedUsd: 0 })).toBe("wallet:$12.35");
  expect(formatBalance(null)).toBe("wallet:?");
  expect(lowBalanceMessage({ balanceUsd: 0.05, usedUsd: 0 })).toContain("low wallet");
  expect(lowBalanceMessage({ balanceUsd: 0.05, usedUsd: 0 })).toContain("$0.05");
});
