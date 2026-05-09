import { expect, test } from "bun:test";
import {
  defaultProvider,
  getProvider,
  listProviders,
  providerRegistry,
} from "../src/registry.ts";

test("registry map still contains hidden built-ins (lookup-only)", () => {
  // mikan stays in the underlying registry map so getProvider("mikan") and
  // any persisted user config still resolve. It just gets filtered out of
  // listProviders(). See HIDDEN_PROVIDER_IDS in registry.ts.
  expect(providerRegistry.has("mikan")).toBe(true);
  expect(providerRegistry.has("openai")).toBe(true);
});

test("registry has at least 24 providers (v0.5 matrix)", () => {
  expect(providerRegistry.size).toBeGreaterThanOrEqual(24);
});

test("getProvider still resolves hidden mikan by id", () => {
  const p = getProvider("mikan");
  expect(p?.id).toBe("mikan");
});

test("getProvider returns openai by id", () => {
  const p = getProvider("openai");
  expect(p?.id).toBe("openai");
});

test("getProvider returns undefined for unknown id", () => {
  expect(getProvider("zzz-not-a-provider")).toBeUndefined();
});

test("defaultProvider returns deepseek (mikan hidden)", () => {
  expect(defaultProvider().id).toBe("deepseek");
});

test("listProviders enumerates the visible matrix (mikan hidden)", () => {
  const ids = listProviders().map((p) => p.id);
  expect(ids).not.toContain("mikan");
  expect(ids).toContain("deepseek");
  expect(ids).toContain("openai");
  expect(ids).toContain("anthropic");
  expect(ids).toContain("google");
  expect(ids).toContain("ollama");
  expect(ids).toContain("custom");
});

// F5 P1 SECURITY: deepseek-cn must NOT use the typosquat host
// `api.deepseeki.com` as its baseURL. We grep for the load-bearing
// `baseURL: "..."` line to skip the security-callout comment that
// intentionally names the typosquat.
test("F5 P1: deepseek-cn baseURL is not the typosquat host (api.deepseeki.com)", async () => {
  const fs = await import("node:fs");
  const path = await import("node:path");
  const src = fs.readFileSync(
    path.resolve(__dirname, "..", "src", "providers", "deepseek-cn.ts"),
    "utf8",
  );
  // Extract the baseURL string literal: must point at the real DeepSeek host.
  const m = /baseURL:\s*"([^"]+)"/.exec(src);
  expect(m).not.toBeNull();
  if (m) {
    expect(m[1]).toBe("https://api.deepseek.com");
    expect(m[1]).not.toContain("deepseeki");
  }
});
