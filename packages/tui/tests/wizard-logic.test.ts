// Phase 2 — wizard state machine.
//
// Pure tests, no OpenTUI mount. Cover happy path + invalid-input edges
// + local-provider exception (no API key required).

import { test, expect } from "bun:test";
import {
  advanceStep,
  backStep,
  initialWizardState,
  isApiKeyRequired,
  toResult,
  type WizardProviderInfo,
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
];

test("initialWizardState empty", () => {
  const s = initialWizardState();
  expect(s.step).toBe("provider");
  expect(s.provider).toBe("");
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
  const s = { step: "apiKey" as const, provider: "mikan", apiKey: "sk-x", model: "" };
  const next = advanceStep(s, PROVIDERS);
  expect(next.step).toBe("model");
});

test("advanceStep apiKey→model when local provider has empty key", () => {
  const s = { step: "apiKey" as const, provider: "ollama", apiKey: "", model: "llama3.1:8b" };
  const next = advanceStep(s, PROVIDERS);
  expect(next.step).toBe("model");
});

test("advanceStep stays in apiKey when required key empty", () => {
  const s = { step: "apiKey" as const, provider: "mikan", apiKey: "  ", model: "" };
  const next = advanceStep(s, PROVIDERS);
  expect(next.step).toBe("apiKey");
});

test("advanceStep model→done when model non-empty", () => {
  const s = {
    step: "model" as const,
    provider: "mikan",
    apiKey: "sk-x",
    model: "deepseek-v4-flash",
  };
  const next = advanceStep(s, PROVIDERS);
  expect(next.step).toBe("done");
});

test("advanceStep stays in model when blank", () => {
  const s = { step: "model" as const, provider: "mikan", apiKey: "sk", model: "" };
  const next = advanceStep(s, PROVIDERS);
  expect(next.step).toBe("model");
});

test("advanceStep idempotent at done", () => {
  const s = {
    step: "done" as const,
    provider: "mikan",
    apiKey: "sk",
    model: "deepseek-v4-flash",
  };
  expect(advanceStep(s, PROVIDERS).step).toBe("done");
});

test("backStep reverses provider edge stays put", () => {
  const s = initialWizardState();
  expect(backStep(s).step).toBe("provider");
});

test("backStep apiKey→provider", () => {
  const s = { step: "apiKey" as const, provider: "mikan", apiKey: "", model: "" };
  expect(backStep(s).step).toBe("provider");
});

test("backStep model→apiKey", () => {
  const s = {
    step: "model" as const,
    provider: "mikan",
    apiKey: "sk",
    model: "deepseek-v4-flash",
  };
  expect(backStep(s).step).toBe("apiKey");
});

test("backStep done→model", () => {
  const s = {
    step: "done" as const,
    provider: "mikan",
    apiKey: "sk",
    model: "deepseek-v4-flash",
  };
  expect(backStep(s).step).toBe("model");
});

test("isApiKeyRequired false for ollama / vllm / sglang", () => {
  expect(isApiKeyRequired("ollama")).toBe(false);
  expect(isApiKeyRequired("vllm")).toBe(false);
  expect(isApiKeyRequired("sglang")).toBe(false);
});

test("isApiKeyRequired true for mikan / deepseek / anthropic / openai", () => {
  expect(isApiKeyRequired("mikan")).toBe(true);
  expect(isApiKeyRequired("deepseek")).toBe(true);
  expect(isApiKeyRequired("anthropic")).toBe(true);
  expect(isApiKeyRequired("openai")).toBe(true);
});

test("toResult snapshots provider/apiKey/model", () => {
  const s = {
    step: "done" as const,
    provider: "mikan",
    apiKey: "sk-x",
    model: "deepseek-v4-flash",
  };
  expect(toResult(s)).toEqual({
    provider: "mikan",
    apiKey: "sk-x",
    model: "deepseek-v4-flash",
  });
});
