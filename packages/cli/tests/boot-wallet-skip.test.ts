import { test, expect } from "bun:test";
import { bootInteractive } from "../src/boot.ts";

// post-v1.0 #2 UX fix: wallet probe must NOT fire when the active provider
// is not mikan (deepseek.com / openai.com / etc don't expose /v1/usage).

test("non-mikan provider skips wallet probe entirely", async () => {
  let called = 0;
  const r = await bootInteractive({
    apiKey: "sk-test",
    providerId: "deepseek",
    skipSync: true,
    fetch: (async () => {
      called += 1;
      return new Response("{}", { status: 200 });
    }) as unknown as typeof fetch,
    env: { LANG: "en" } as NodeJS.ProcessEnv,
  });
  expect(called).toBe(0);
  expect(r.wallet).toBeNull();
  expect(r.messages).toEqual([]);
});

test("mikan provider DOES probe wallet", async () => {
  let called = 0;
  await bootInteractive({
    apiKey: "sk-test",
    providerId: "mikan",
    skipSync: true,
    fetch: (async () => {
      called += 1;
      return new Response(JSON.stringify({ balance_usd: 5 }), { status: 200 });
    }) as unknown as typeof fetch,
    env: { LANG: "en" } as NodeJS.ProcessEnv,
  });
  expect(called).toBe(1);
});

test("undefined providerId defaults to probe (cli default is mikan)", async () => {
  let called = 0;
  await bootInteractive({
    apiKey: "sk-test",
    skipSync: true,
    fetch: (async () => {
      called += 1;
      return new Response(JSON.stringify({ balance_usd: 5 }), { status: 200 });
    }) as unknown as typeof fetch,
    env: { LANG: "en" } as NodeJS.ProcessEnv,
  });
  expect(called).toBe(1);
});

test("openai provider skips wallet probe", async () => {
  let called = 0;
  const r = await bootInteractive({
    apiKey: "sk-test",
    providerId: "openai",
    skipSync: true,
    fetch: (async () => {
      called += 1;
      return new Response("{}", { status: 200 });
    }) as unknown as typeof fetch,
    env: { LANG: "en" } as NodeJS.ProcessEnv,
  });
  expect(called).toBe(0);
  expect(r.wallet).toBeNull();
});
