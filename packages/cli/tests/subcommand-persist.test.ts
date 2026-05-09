// F5 P0-NEW #2 regression: `openseek setup` / `openseek model` subcommand
// must NOT persist an env-sourced apiKey to disk, and `openseek model`
// must NEVER touch api_key or provider on disk (model-only).
//
// We exercise the pure helper `buildSubcommandSavePayload` extracted from
// `runWizardSubcommand` so the test doesn't have to spin up the wizard.

import { test, expect } from "bun:test";
import { buildSubcommandSavePayload } from "../src/index.ts";

test("F5 P0-NEW #2: setup with env-sourced apiKey does NOT persist apiKey", () => {
  const payload = buildSubcommandSavePayload({
    name: "setup",
    result: { provider: "openai", model: "gpt-4o", apiKey: "sk-from-env" },
    config: { provider: "mikan", model: "deepseek-v4-flash", apiKey: "sk-from-env" },
    configSource: { apiKey: "env" },
  });
  // provider + model persist; apiKey must be absent.
  expect(payload.provider).toBe("openai");
  expect(payload.model).toBe("gpt-4o");
  expect("apiKey" in payload).toBe(false);
});

test("F5 P0-NEW #2: setup persists apiKey when wizard supplied a NEW key (and prior source wasn't env)", () => {
  const payload = buildSubcommandSavePayload({
    name: "setup",
    result: { provider: "mikan", model: "deepseek-v4-flash", apiKey: "sk-fresh" },
    config: { provider: "mikan", model: "deepseek-v4-flash", apiKey: "sk-old" },
    configSource: { apiKey: "user" },
  });
  expect(payload.apiKey).toBe("sk-fresh");
  expect(payload.provider).toBe("mikan");
  expect(payload.model).toBe("deepseek-v4-flash");
});

test("F5 P0-NEW #2: setup with same apiKey echoed back does NOT persist apiKey", () => {
  const payload = buildSubcommandSavePayload({
    name: "setup",
    result: { provider: "mikan", model: "deepseek-v4-flash", apiKey: "sk-same" },
    config: { provider: "mikan", model: "deepseek-v4-flash", apiKey: "sk-same" },
    configSource: { apiKey: "user" },
  });
  expect("apiKey" in payload).toBe(false);
});

test("F5 P0-NEW #2: model subcommand persists ONLY {model} — never apiKey, never provider", () => {
  // Even when the wizard echoed a different provider AND a fresh apiKey,
  // the model subcommand surface must not let either land on disk.
  const payload = buildSubcommandSavePayload({
    name: "model",
    result: {
      provider: "anthropic",
      model: "claude-sonnet-4-6",
      apiKey: "sk-fresh-from-wizard",
    },
    config: { provider: "mikan", model: "deepseek-v4-flash", apiKey: "sk-old" },
    configSource: { apiKey: "user" },
  });
  expect(payload.model).toBe("claude-sonnet-4-6");
  expect("apiKey" in payload).toBe(false);
  expect("provider" in payload).toBe(false);
});

test("F5 P0-NEW #2: model subcommand never persists env-sourced apiKey either", () => {
  const payload = buildSubcommandSavePayload({
    name: "model",
    result: { provider: "mikan", model: "deepseek-v4-pro", apiKey: "sk-env" },
    config: { provider: "mikan", model: "deepseek-v4-flash", apiKey: "sk-env" },
    configSource: { apiKey: "env" },
  });
  expect(payload.model).toBe("deepseek-v4-pro");
  expect("apiKey" in payload).toBe(false);
  expect("provider" in payload).toBe(false);
});
