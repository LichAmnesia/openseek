// Phase 2 — wizard state machine.
//
// Pure tests, no OpenTUI mount. Cover happy path + invalid-input edges
// + local-provider exception (no API key required) + G8.1 baseUrl step
// (custom provider requires a base URL; everyone else skips the step).

import { test, expect } from "bun:test";
import {
  advanceStep,
  backStep,
  initialWizardState,
  isApiKeyRequired,
  isBaseUrlRequired,
  isValidBaseUrl,
  toResult,
  type WizardProviderInfo,
  type WizardState,
} from "../src/components/wizard-logic.ts";

const PROVIDERS: WizardProviderInfo[] = [
  {
    id: "mikan",
    label: "mikan-cloud",
    defaultModel: "deepseek-v4-flash",
    availableModels: [
      { id: "deepseek-v4-flash", label: "V4 Flash" },
      { id: "deepseek-v4-pro", label: "V4 Pro" },
    ],
  },
  {
    id: "ollama",
    label: "Ollama (local)",
    defaultModel: "llama3.1:8b",
  },
  {
    id: "custom",
    label: "Custom OpenAI-compat",
    defaultModel: "custom-model",
    requiresBaseURL: true,
  },
];

const state = (partial: Partial<WizardState>): WizardState => ({
  step: "provider",
  provider: "",
  baseURL: "",
  apiKey: "",
  model: "",
  ...partial,
});

test("initialWizardState empty", () => {
  const s = initialWizardState();
  expect(s.step).toBe("provider");
  expect(s.provider).toBe("");
  expect(s.baseURL).toBe("");
  expect(s.apiKey).toBe("");
  expect(s.model).toBe("");
});

test("initialWizardState with seed values", () => {
  const s = initialWizardState({ provider: "mikan", apiKey: "sk-x" });
  expect(s.provider).toBe("mikan");
  expect(s.apiKey).toBe("sk-x");
  expect(s.step).toBe("provider");
});

test("advanceStep provider→apiKey when valid provider chosen", () => {
  const s = initialWizardState({ provider: "mikan" });
  const next = advanceStep(s, PROVIDERS);
  expect(next.step).toBe("apiKey");
  expect(next.model).toBe("deepseek-v4-flash"); // preselected default
});

test("advanceStep stays in provider when id is unknown", () => {
  const s = initialWizardState({ provider: "nope" });
  const next = advanceStep(s, PROVIDERS);
  expect(next.step).toBe("provider");
});

test("advanceStep apiKey→model when key non-empty (mikan needs key)", () => {
  const next = advanceStep(state({ step: "apiKey", provider: "mikan", apiKey: "sk-x" }), PROVIDERS);
  expect(next.step).toBe("model");
});

test("advanceStep apiKey→model when local provider has empty key", () => {
  const next = advanceStep(
    state({ step: "apiKey", provider: "ollama", model: "llama3.1:8b" }),
    PROVIDERS,
  );
  expect(next.step).toBe("model");
});

test("advanceStep stays in apiKey when required key empty", () => {
  const next = advanceStep(state({ step: "apiKey", provider: "mikan", apiKey: "  " }), PROVIDERS);
  expect(next.step).toBe("apiKey");
});

test("advanceStep model→done when model non-empty", () => {
  const next = advanceStep(
    state({ step: "model", provider: "mikan", apiKey: "sk-x", model: "deepseek-v4-flash" }),
    PROVIDERS,
  );
  expect(next.step).toBe("done");
});

test("advanceStep stays in model when blank", () => {
  const next = advanceStep(state({ step: "model", provider: "mikan", apiKey: "sk" }), PROVIDERS);
  expect(next.step).toBe("model");
});

test("advanceStep idempotent at done", () => {
  const s = state({ step: "done", provider: "mikan", apiKey: "sk", model: "deepseek-v4-flash" });
  expect(advanceStep(s, PROVIDERS).step).toBe("done");
});

test("backStep reverses provider edge stays put", () => {
  const s = initialWizardState();
  expect(backStep(s).step).toBe("provider");
});

test("backStep apiKey→provider", () => {
  const s = state({ step: "apiKey", provider: "mikan" });
  expect(backStep(s).step).toBe("provider");
});

test("backStep model→apiKey", () => {
  const s = state({ step: "model", provider: "mikan", apiKey: "sk", model: "deepseek-v4-flash" });
  expect(backStep(s).step).toBe("apiKey");
});

test("backStep done→model", () => {
  const s = state({ step: "done", provider: "mikan", apiKey: "sk", model: "deepseek-v4-flash" });
  expect(backStep(s).step).toBe("model");
});

test("isApiKeyRequired false for ollama / vllm / sglang / custom", () => {
  expect(isApiKeyRequired("ollama")).toBe(false);
  expect(isApiKeyRequired("vllm")).toBe(false);
  expect(isApiKeyRequired("sglang")).toBe(false);
  expect(isApiKeyRequired("custom")).toBe(false);
});

test("isApiKeyRequired true for mikan / deepseek / anthropic / openai", () => {
  expect(isApiKeyRequired("mikan")).toBe(true);
  expect(isApiKeyRequired("deepseek")).toBe(true);
  expect(isApiKeyRequired("anthropic")).toBe(true);
  expect(isApiKeyRequired("openai")).toBe(true);
});

test("toResult snapshots provider/apiKey/model", () => {
  const s = state({ step: "done", provider: "mikan", apiKey: "sk-x", model: "deepseek-v4-flash" });
  expect(toResult(s, PROVIDERS)).toEqual({
    provider: "mikan",
    apiKey: "sk-x",
    model: "deepseek-v4-flash",
  });
});

// ---------- G8.1: baseUrl step (custom provider) ----------

test("isBaseUrlRequired true only for requiresBaseURL providers", () => {
  expect(isBaseUrlRequired("custom", PROVIDERS)).toBe(true);
  expect(isBaseUrlRequired("mikan", PROVIDERS)).toBe(false);
  expect(isBaseUrlRequired("ollama", PROVIDERS)).toBe(false);
  expect(isBaseUrlRequired("unknown", PROVIDERS)).toBe(false);
});

test("isValidBaseUrl accepts http/https, rejects everything else", () => {
  expect(isValidBaseUrl("http://lich-server.local:8004/v1")).toBe(true);
  expect(isValidBaseUrl("https://api.example.com/v1")).toBe(true);
  expect(isValidBaseUrl("  http://x/v1  ")).toBe(true);
  expect(isValidBaseUrl("")).toBe(false);
  expect(isValidBaseUrl("localhost:8004/v1")).toBe(false);
  expect(isValidBaseUrl("ftp://x")).toBe(false);
});

test("advanceStep provider→baseUrl for custom provider", () => {
  const next = advanceStep(state({ provider: "custom" }), PROVIDERS);
  expect(next.step).toBe("baseUrl");
  expect(next.model).toBe("custom-model");
});

test("advanceStep stays in baseUrl on invalid URL", () => {
  const s = state({ step: "baseUrl", provider: "custom", baseURL: "not-a-url" });
  expect(advanceStep(s, PROVIDERS).step).toBe("baseUrl");
});

test("advanceStep baseUrl→apiKey on valid URL, then empty key is OK for custom", () => {
  const s = state({ step: "baseUrl", provider: "custom", baseURL: "http://lich-server.local:8004/v1" });
  const atKey = advanceStep(s, PROVIDERS);
  expect(atKey.step).toBe("apiKey");
  const atModel = advanceStep({ ...atKey, model: "qwen3.6-35b-a3b" }, PROVIDERS);
  expect(atModel.step).toBe("model");
});

test("backStep apiKey→baseUrl for custom, baseUrl→provider", () => {
  const atKey = state({ step: "apiKey", provider: "custom" });
  expect(backStep(atKey, PROVIDERS).step).toBe("baseUrl");
  const atUrl = state({ step: "baseUrl", provider: "custom" });
  expect(backStep(atUrl, PROVIDERS).step).toBe("provider");
});

test("toResult includes trimmed baseURL for custom only", () => {
  const custom = state({
    step: "done",
    provider: "custom",
    baseURL: " http://lich-server.local:8004/v1 ",
    model: "qwen3.6-35b-a3b",
  });
  expect(toResult(custom, PROVIDERS)).toEqual({
    provider: "custom",
    apiKey: "",
    model: "qwen3.6-35b-a3b",
    baseURL: "http://lich-server.local:8004/v1",
  });
  // Non-custom provider never carries baseURL even if state has one.
  const mikan = state({
    step: "done",
    provider: "mikan",
    baseURL: "http://stale/v1",
    apiKey: "sk",
    model: "deepseek-v4-flash",
  });
  expect(toResult(mikan, PROVIDERS)).toEqual({
    provider: "mikan",
    apiKey: "sk",
    model: "deepseek-v4-flash",
  });
});
