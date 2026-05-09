// G5.6 regression suite — guards the v0.5 25-provider matrix.

import { expect, test } from "bun:test";
import {
  defaultProvider,
  getProvider,
  listProviders,
  providerByModel,
  providerRegistry,
} from "../src/registry.ts";

test("listProviders has at least 23 visible providers (mikan hidden)", () => {
  // 27 registered − 1 hidden (mikan) = 26 visible. Floor stays well above
  // the minimum we ever ship.
  expect(listProviders().length).toBeGreaterThanOrEqual(23);
});

test("all visible provider ids are unique and exclude mikan", () => {
  const ids = listProviders().map((p) => p.id);
  expect(new Set(ids).size).toBe(ids.length);
  expect(ids).not.toContain("mikan");
});

test("deepseek is the default provider while mikan is hidden", () => {
  expect(defaultProvider().id).toBe("deepseek");
});

test("each visible provider exposes a working createClient", () => {
  for (const p of listProviders()) {
    // We pass a dummy apiKey; createClient must not throw or reach the network.
    const client = p.createClient(p.defaultModel, { apiKey: "sk-test" });
    expect(client).toBeDefined();
  }
});

test("expected v0.5 providers are all registered (incl. hidden mikan)", () => {
  // providerRegistry stays fully populated even when listProviders() filters
  // mikan — confirms we hide for picker UX without breaking direct lookup.
  const expected = [
    "mikan",
    "openai",
    "deepseek",
    "deepseek-cn",
    "fireworks",
    "nvidia-nim",
    "novita",
    "openrouter",
    "sglang",
    "vllm",
    "groq",
    "together",
    "cerebras",
    "deepinfra",
    "perplexity",
    "mistral",
    "xai",
    "cohere",
    "vercel-gateway",
    "anthropic",
    "bedrock",
    "vertex",
    "azure-foundry",
    "google",
    "vertex-google",
    "ollama",
    "custom",
  ];
  for (const id of expected) {
    expect(providerRegistry.has(id)).toBe(true);
  }
});

test("getProvider returns undefined for unknown ids", () => {
  expect(getProvider("not-a-provider")).toBeUndefined();
});

test("providerByModel routes gpt-* to openai", () => {
  expect(providerByModel("gpt-4o")?.id).toBe("openai");
  expect(providerByModel("gpt-4-turbo")?.id).toBe("openai");
});

test("providerByModel routes claude-* to anthropic", () => {
  expect(providerByModel("claude-sonnet-4-5")?.id).toBe("anthropic");
});

test("providerByModel routes gemini-* to google", () => {
  expect(providerByModel("gemini-2.0-flash-exp")?.id).toBe("google");
});

test("providerByModel routes deepseek-* to deepseek (mikan hidden)", () => {
  expect(providerByModel("deepseek-chat")?.id).toBe("deepseek");
});

test("providerByModel honors <provider>/<model> prefix", () => {
  expect(providerByModel("openrouter/anything")?.id).toBe("openrouter");
  expect(providerByModel("groq/llama-3.3-70b")?.id).toBe("groq");
});

test("providerByModel returns undefined for ambiguous ids", () => {
  expect(providerByModel("totally-unknown-model")).toBeUndefined();
});
