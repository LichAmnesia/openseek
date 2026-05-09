// e2e: provider/model switch (G7.2 #5).
// Validates registry lookups + capability inversion across the matrix.

import { describe, expect, test } from "bun:test";
import {
  getProvider,
  listProviders,
  providerByModel,
  defaultProvider,
} from "@openseek/provider";

describe("e2e: provider switch", () => {
  test("listProviders returns the visible matrix (mikan hidden)", () => {
    const all = listProviders();
    // 27 registered − 1 hidden (mikan) = 26 visible. Floor at 23 so we
    // don't have to bump it every time we add/remove a provider.
    expect(all.length).toBeGreaterThanOrEqual(23);
    const ids = all.map((p) => p.id);
    expect(ids).not.toContain("mikan");
    expect(ids).toContain("deepseek");
    expect(ids).toContain("openai");
    expect(ids).toContain("anthropic");
    expect(ids).toContain("google");
  });

  test("default provider is deepseek and exposes deepseek-v4-flash capability", () => {
    const def = defaultProvider();
    expect(def.id).toBe("deepseek");
    expect(def.defaultModel).toBe("deepseek-v4-flash");
    const cap = def.capability("deepseek-v4-flash");
    expect(cap.contextWindow).toBeGreaterThan(0);
  });

  test("providerByModel routes well-known model prefixes (mikan hidden)", () => {
    expect(providerByModel("gpt-4o")?.id).toBe("openai");
    expect(providerByModel("claude-sonnet-4-5-20250929")?.id).toBe("anthropic");
    expect(providerByModel("gemini-2.5-pro")?.id).toBe("google");
    expect(providerByModel("deepseek-chat")?.id).toBe("deepseek");
  });

  test("getProvider still resolves hidden mikan (lookup intact)", () => {
    // Hiding only filters listings — the registry map keeps mikan so any
    // persisted user config or direct lookup still works.
    const a = getProvider("mikan");
    const b = getProvider("mikan");
    expect(a).toBeDefined();
    expect(a).toBe(b);
  });
});
