// Sweep every registered provider and assert its capability(modelId) returns a
// well-formed ProviderCapability with all required fields. Catches regressions
// where a new provider forgets a flag or returns undefined for an unknown id.

import { expect, test } from "bun:test";
import { listProviders } from "../src/registry.ts";

const REQUIRED_KEYS = [
  "contextWindow",
  "maxOutput",
  "supportsThinking",
  "supportsCacheControl",
  "supportsToolUse",
  "payloadMode",
  "requiresReasoningReplay",
] as const;

const VALID_PAYLOAD_MODES = new Set([
  "chat-completions",
  "anthropic-messages",
  "google-generate",
]);

const VALID_PROTOCOLS = new Set(["openai-compat", "anthropic", "google"]);

for (const provider of listProviders()) {
  test(`${provider.id}: capability(defaultModel) returns full ProviderCapability`, () => {
    const cap = provider.capability(provider.defaultModel);
    expect(cap).toBeDefined();
    for (const key of REQUIRED_KEYS) {
      expect(cap).toHaveProperty(key);
    }
    expect(typeof cap.contextWindow).toBe("number");
    expect(cap.contextWindow).toBeGreaterThan(0);
    expect(typeof cap.maxOutput).toBe("number");
    expect(cap.maxOutput).toBeGreaterThan(0);
    expect(typeof cap.supportsThinking).toBe("boolean");
    expect(typeof cap.supportsCacheControl).toBe("boolean");
    expect(typeof cap.supportsToolUse).toBe("boolean");
    expect(typeof cap.requiresReasoningReplay).toBe("boolean");
    expect(VALID_PAYLOAD_MODES.has(cap.payloadMode)).toBe(true);
  });

  test(`${provider.id}: protocol is one of openai-compat | anthropic | google`, () => {
    expect(VALID_PROTOCOLS.has(provider.protocol)).toBe(true);
  });

  test(`${provider.id}: defaultModel is non-empty`, () => {
    expect(provider.defaultModel.length).toBeGreaterThan(0);
  });
}
