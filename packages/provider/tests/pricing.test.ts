import { test, expect, beforeEach, mock } from "bun:test";
import { _resetPricingWarnings, estimateCost, formatCost, getPricing } from "../src/pricing.ts";
import { listProviderListings } from "../src/registry.ts";

beforeEach(() => {
  _resetPricingWarnings();
});

test("getPricing returns pricing for deepseek-chat (raw + mikan/ prefix)", () => {
  expect(getPricing("deepseek-chat")?.input).toBeCloseTo(0.27);
  expect(getPricing("mikan/deepseek-chat")?.output).toBeCloseTo(1.1);
});

test("estimateCost computes cost for deepseek-chat with no cache", () => {
  // 1M input * 0.27 + 1M output * 1.10 = 1.37
  const usd = estimateCost({ totalIn: 1_000_000, totalOut: 1_000_000 }, "deepseek-chat");
  expect(usd).toBeCloseTo(1.37, 4);
});

test("estimateCost honors cacheRead at the cheaper rate", () => {
  // 500K cache hit + 500K uncached + 1M output
  // = 500_000 * 0.07 / 1M + 500_000 * 0.27 / 1M + 1_000_000 * 1.10 / 1M
  // = 0.035 + 0.135 + 1.10 = 1.27
  const usd = estimateCost(
    { totalIn: 1_000_000, totalOut: 1_000_000, cacheRead: 500_000 },
    "deepseek-chat",
  );
  expect(usd).toBeCloseTo(1.27, 4);
});

test("estimateCost reasoner pricing", () => {
  // 1M in @ 0.55 + 1M out @ 2.19 = 2.74
  const usd = estimateCost({ totalIn: 1_000_000, totalOut: 1_000_000 }, "deepseek-reasoner");
  expect(usd).toBeCloseTo(2.74, 4);
});

test("estimateCost gpt-4o pricing", () => {
  // 1M in @ 2.5 + 1M out @ 10 = 12.5
  const usd = estimateCost({ totalIn: 1_000_000, totalOut: 1_000_000 }, "gpt-4o");
  expect(usd).toBeCloseTo(12.5, 4);
});

test("estimateCost unknown model returns 0", () => {
  const usd = estimateCost({ totalIn: 1_000_000, totalOut: 1_000_000 }, "no-such-model");
  expect(usd).toBe(0);
});

test("formatCost picks right precision", () => {
  expect(formatCost(0)).toBe("$0.00");
  expect(formatCost(0.0034)).toBe("$0.0034");
  expect(formatCost(1.234)).toBe("$1.23");
  expect(formatCost(0.005)).toBe("$0.0050");
});

// ---------- F2 Bug 2.3: post-Phase-1 model id coverage ----------
//
// Every model id the picker actually advertises (mikan / openai / anthropic
// / google / deepseek availableModels) must be priced. A 0-cost regression
// here means the status-bar cost meter silently undercounts.

test("F2: deepseek-v4-flash priced (default model)", () => {
  // 1M in @ 0.14 + 1M out @ 0.28 = 0.42
  const usd = estimateCost({ totalIn: 1_000_000, totalOut: 1_000_000 }, "deepseek-v4-flash");
  expect(usd).toBeCloseTo(0.42, 4);
  expect(usd).toBeGreaterThan(0);
});

test("F2: deepseek-v4-pro priced", () => {
  const usd = estimateCost({ totalIn: 1_000_000, totalOut: 1_000_000 }, "deepseek-v4-pro");
  expect(usd).toBeCloseTo(1.305, 4);
  expect(usd).toBeGreaterThan(0);
});

test("F2: claude-sonnet-4-6 priced same as 4-5", () => {
  const sonnet46 = estimateCost({ totalIn: 1_000_000, totalOut: 1_000_000 }, "claude-sonnet-4-6");
  const sonnet45 = estimateCost({ totalIn: 1_000_000, totalOut: 1_000_000 }, "claude-sonnet-4-5");
  expect(sonnet46).toBeCloseTo(18.0, 4);
  expect(sonnet45).toBeCloseTo(18.0, 4);
});

test("F2: claude-opus-4-7 priced and tagged TODO", () => {
  const usd = estimateCost({ totalIn: 1_000_000, totalOut: 1_000_000 }, "claude-opus-4-7");
  expect(usd).toBeGreaterThan(0);
});

test("F2: claude-haiku-4-5 priced", () => {
  const usd = estimateCost({ totalIn: 1_000_000, totalOut: 1_000_000 }, "claude-haiku-4-5");
  expect(usd).toBeCloseTo(6.0, 4);
});

test("F2: gpt-5.2 priced (TODO placeholder)", () => {
  const usd = estimateCost({ totalIn: 1_000_000, totalOut: 1_000_000 }, "gpt-5.2");
  expect(usd).toBeGreaterThan(0);
});

test("F2: gpt-4o-mini priced", () => {
  const usd = estimateCost({ totalIn: 1_000_000, totalOut: 1_000_000 }, "gpt-4o-mini");
  expect(usd).toBeCloseTo(0.75, 4);
});

test("F2: gemini-3-flash-preview priced", () => {
  const usd = estimateCost({ totalIn: 1_000_000, totalOut: 1_000_000 }, "gemini-3-flash-preview");
  expect(usd).toBeCloseTo(0.375, 4);
});

test("F2: gemini-3-pro-preview priced", () => {
  const usd = estimateCost({ totalIn: 1_000_000, totalOut: 1_000_000 }, "gemini-3-pro-preview");
  expect(usd).toBeCloseTo(6.25, 4);
});

test("F2: every picker model id has a non-zero PRICING entry", () => {
  // Mirror the picker's availableModels for the four primary providers; if a
  // future model bump adds an id without a pricing row this test breaks loud.
  const pickerModels = [
    // mikan
    "deepseek-v4-flash",
    "deepseek-v4-pro",
    "claude-sonnet-4-6",
    "gpt-4o-mini",
    "gemini-3-flash-preview",
    "gemini-3-pro-preview",
    "deepseek-chat",
    // openai
    "gpt-5.2",
    "gpt-4o",
    // anthropic
    "claude-opus-4-7",
    "claude-sonnet-4-5",
    "claude-haiku-4-5",
    // google
    "gemini-2.0-flash-exp",
    // deepseek
    "deepseek-reasoner",
  ];
  const missing = pickerModels.filter((id) => getPricing(id) === null);
  expect(missing).toEqual([]);
});

// F5 P1 derived coverage gate: every model id the picker advertises across
// EVERY provider with availableModels must have a PRICING entry. Pre-fix,
// groq llamas / cerebras / mistral / xai / cohere / perplexity went silent
// $0 because no entry existed.
test("F5 P1: every picker model has a PRICING entry (cross-provider)", () => {
  const missing: string[] = [];
  for (const p of listProviderListings()) {
    for (const m of p.availableModels ?? []) {
      if (getPricing(m.id) === null) missing.push(`${p.id}/${m.id}`);
    }
  }
  expect(missing).toEqual([]);
});

// F5 P1: defaultModel for providers that DON'T expose availableModels is
// also the picker's selection — must be priced.
test("F5 P1: defaultModel of every provider has a PRICING entry", () => {
  const missing: string[] = [];
  for (const p of listProviderListings()) {
    // Skip aggregators — openrouter / vercel-gateway / custom etc. surface
    // free-text model ids; pricing is keyed off the underlying model and
    // the user must pick it explicitly.
    if (
      p.id === "openrouter" ||
      p.id === "vercel-gateway" ||
      p.id === "custom" ||
      p.id === "ollama" ||
      p.id === "vllm" ||
      p.id === "sglang" ||
      p.id === "nvidia-nim" ||
      p.id === "novita" ||
      p.id === "fireworks" ||
      p.id === "together" ||
      p.id === "deepinfra" ||
      p.id === "azure-foundry" ||
      p.id === "bedrock" ||
      p.id === "vertex" ||
      p.id === "vertex-google"
    ) {
      continue;
    }
    if (getPricing(p.defaultModel) === null) missing.push(`${p.id}/${p.defaultModel}`);
  }
  expect(missing).toEqual([]);
});

test("F2: estimateCost warns once on unknown model id", () => {
  const warn = mock(() => {});
  const original = console.warn;
  console.warn = warn as unknown as typeof console.warn;
  try {
    estimateCost({ totalIn: 1, totalOut: 1 }, "totally-fake-model-xyz");
    estimateCost({ totalIn: 2, totalOut: 2 }, "totally-fake-model-xyz");
    estimateCost({ totalIn: 3, totalOut: 3 }, "totally-fake-model-xyz");
    // Same id three times → warn once.
    expect(warn).toHaveBeenCalledTimes(1);
    estimateCost({ totalIn: 1, totalOut: 1 }, "another-fake-model-xyz");
    // Different id → second warn.
    expect(warn).toHaveBeenCalledTimes(2);
  } finally {
    console.warn = original;
  }
});
