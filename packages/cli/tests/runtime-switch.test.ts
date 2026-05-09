// Phase 3 — runtime-switch pure helpers.
//
// We test `nextOpts` and `buildWizardProviders` only — the actual wizard
// + dispatch flow is covered by the smoke test (it exercises the TUI loop
// end-to-end with a mock).

import { test, expect } from "bun:test";
import { defaultProvider, getProvider } from "@openseek/provider";
import { nextOpts, buildWizardProviders } from "../src/runtime-switch.ts";
import type { InteractiveOpts } from "../src/interactive.ts";

const baseOpts = (): InteractiveOpts => ({
  provider: defaultProvider(),
  modelId: "deepseek-v4-flash",
  apiKey: "sk-old",
});

test("nextOpts swaps provider/model/apiKey from wizard result", () => {
  const cur = baseOpts();
  const result = { provider: "openai", model: "gpt-4o", apiKey: "sk-new" };
  const next = nextOpts(cur, result);
  expect(next.provider.id).toBe("openai");
  expect(next.modelId).toBe("gpt-4o");
  expect(next.apiKey).toBe("sk-new");
});

test("nextOpts falls back to defaultProvider when id is unknown", () => {
  const cur = baseOpts();
  const result = { provider: "no-such-provider", model: "x", apiKey: "k" };
  const next = nextOpts(cur, result);
  expect(next.provider.id).toBe(defaultProvider().id);
});

test("nextOpts preserves baseURL for same-provider model switch", () => {
  // Same-provider check uses the provider id, so cur (defaultProvider —
  // currently deepseek) and result must share an id for baseURL to carry.
  const cur: InteractiveOpts = { ...baseOpts(), baseURL: "http://localhost:8000/v1" };
  const result = { provider: "deepseek", model: "deepseek-v4-pro", apiKey: "sk-new" };
  const next = nextOpts(cur, result);
  expect(next.baseURL).toBe("http://localhost:8000/v1");
});

test("nextOpts clears baseURL when provider changes", () => {
  const cur: InteractiveOpts = { ...baseOpts(), baseURL: "http://localhost:8000/v1" };
  const result = { provider: "openai", model: "gpt-4o", apiKey: "sk-new" };
  const next = nextOpts(cur, result);
  expect(next.baseURL).toBeUndefined();
});

test("nextOpts omits baseURL when current has none", () => {
  const cur = baseOpts();
  const result = { provider: "openai", model: "gpt-4o", apiKey: "sk-new" };
  const next = nextOpts(cur, result);
  expect(next.baseURL).toBeUndefined();
});

test("buildWizardProviders returns picker-ready listings (mikan hidden)", () => {
  const list = buildWizardProviders();
  expect(list.length).toBeGreaterThan(5);
  // mikan is currently hidden — the wizard picker must not surface it.
  expect(list.find((p) => p.id === "mikan")).toBeUndefined();
  // deepseek is the new default-eligible provider; assert it's listed and
  // its defaultModel is wired through.
  const deepseek = list.find((p) => p.id === "deepseek");
  expect(deepseek).toBeDefined();
  expect(deepseek?.defaultModel).toBe(getProvider("deepseek")?.defaultModel);
});

// F1.5: the apiKeyChanged flag drives whether the CLI loop persists a
// (potentially env-sourced) key to disk. Wizard returning the same key it
// was seeded with must NOT trip the flag.
test("nextOpts marks apiKeyChanged=false when wizard echoes the same key", () => {
  const cur = baseOpts();
  const result = { provider: "openai", model: "gpt-4o", apiKey: "sk-old" };
  const next = nextOpts(cur, result);
  expect(next.apiKeyChanged).toBe(false);
});

test("nextOpts marks apiKeyChanged=true when wizard returned a new key", () => {
  const cur = baseOpts();
  const result = { provider: "openai", model: "gpt-4o", apiKey: "sk-fresh" };
  const next = nextOpts(cur, result);
  expect(next.apiKeyChanged).toBe(true);
});

test("nextOpts forwards the configSource map so env-source persists across switches", () => {
  const cur: InteractiveOpts = {
    ...baseOpts(),
    configSource: {
      provider: "user",
      model: "user",
      apiKey: "env",
    },
  };
  const result = { provider: "openai", model: "gpt-4o", apiKey: "sk-old" };
  const next = nextOpts(cur, result);
  expect(next.configSource?.apiKey).toBe("env");
});

// F1.5 end-to-end: simulate the persist-decision the CLI loop makes.
// When apiKey came from env and the wizard didn't change it, saveUserConfig
// should be called WITHOUT an `apiKey` field in its payload.
test("env-sourced apiKey is never persisted on a model-only switch", () => {
  const cur: InteractiveOpts = {
    ...baseOpts(),
    apiKey: "sk-from-env",
    configSource: { provider: "user", model: "user", apiKey: "env" },
  };
  const result = { provider: "openai", model: "gpt-4o-different", apiKey: "sk-from-env" };
  const next = nextOpts(cur, result);
  // Mirrors the CLI loop's persist-decision logic.
  const apiKeySource = cur.configSource?.apiKey;
  const persistApiKey = next.apiKeyChanged === true && apiKeySource !== "env";
  expect(persistApiKey).toBe(false);
});

test("user-sourced apiKey IS persisted when the wizard changes it", () => {
  const cur: InteractiveOpts = {
    ...baseOpts(),
    apiKey: "sk-from-user",
    configSource: { provider: "user", model: "user", apiKey: "user" },
  };
  const result = { provider: "openai", model: "gpt-4o", apiKey: "sk-fresh-from-wizard" };
  const next = nextOpts(cur, result);
  const apiKeySource = cur.configSource?.apiKey;
  const persistApiKey = next.apiKeyChanged === true && apiKeySource !== "env";
  expect(persistApiKey).toBe(true);
});
