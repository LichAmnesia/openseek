import { expect, test } from "bun:test";
import { mikanProvider } from "../src/providers/mikan.ts";

test("mikan provider id and protocol", () => {
  expect(mikanProvider.id).toBe("mikan");
  expect(mikanProvider.protocol).toBe("openai-compat");
  expect(mikanProvider.defaultModel).toBe("deepseek-v4-flash");
});

test("mikan deepseek-chat capability flags reasoning replay", () => {
  const cap = mikanProvider.capability("deepseek-chat");
  expect(cap.requiresReasoningReplay).toBe(true);
  expect(cap.supportsThinking).toBe(true);
  expect(cap.supportsToolUse).toBe(true);
  expect(cap.supportsCacheControl).toBe(true);
  expect(cap.payloadMode).toBe("chat-completions");
  expect(cap.contextWindow).toBe(1_000_000);
  expect(cap.maxOutput).toBe(16_384);
});

test("mikan capability is identical for deepseek-reasoner", () => {
  const cap = mikanProvider.capability("deepseek-reasoner");
  expect(cap.requiresReasoningReplay).toBe(true);
});

test("mikan gateway does not apply DeepSeek replay flags to Claude/GPT/Gemini models", () => {
  const claude = mikanProvider.capability("claude-sonnet-4-6");
  expect(claude.requiresReasoningReplay).toBe(false);
  expect(claude.supportsCacheControl).toBe(false);
  expect(claude.contextWindow).toBe(200_000);

  const gpt = mikanProvider.capability("gpt-4o-mini");
  expect(gpt.requiresReasoningReplay).toBe(false);
  expect(gpt.supportsThinking).toBe(false);
  expect(gpt.contextWindow).toBe(128_000);

  const gemini = mikanProvider.capability("gemini-3-flash-preview");
  expect(gemini.requiresReasoningReplay).toBe(false);
  expect(gemini.supportsThinking).toBe(true);
  expect(gemini.contextWindow).toBe(1_000_000);
});

test("mikan createClient returns a non-null object without making a request", () => {
  const client = mikanProvider.createClient("deepseek-chat", { apiKey: "sk-test" });
  expect(client).toBeDefined();
  expect(client).not.toBeNull();
});
