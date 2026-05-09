import { expect, test } from "bun:test";
import { openaiProvider } from "../src/providers/openai.ts";

test("openai provider id and protocol", () => {
  expect(openaiProvider.id).toBe("openai");
  expect(openaiProvider.protocol).toBe("openai-compat");
  expect(openaiProvider.defaultModel).toBe("gpt-4o");
});

test("openai gpt-4o capability does NOT require reasoning replay", () => {
  const cap = openaiProvider.capability("gpt-4o");
  expect(cap.requiresReasoningReplay).toBe(false);
  expect(cap.supportsThinking).toBe(false);
  expect(cap.supportsToolUse).toBe(true);
  expect(cap.supportsCacheControl).toBe(false);
  expect(cap.payloadMode).toBe("chat-completions");
});

test("openai createClient returns a non-null object without making a request", () => {
  const client = openaiProvider.createClient("gpt-4o", { apiKey: "sk-test" });
  expect(client).toBeDefined();
  expect(client).not.toBeNull();
});
