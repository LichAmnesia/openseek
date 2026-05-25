// MiniMax provider — OpenAI-compat sanity tests.
//
// Mirrors `openai-capability.test.ts` for the new MiniMax adapter: id
// + protocol + capability shape + non-network createClient. Also asserts
// the M2.7 → highspeed fastVariant wiring so /fast keeps working when
// the user picks M2.7.

import { expect, test } from "bun:test";
import { minimaxProvider } from "../src/providers/minimax.ts";
import { providerByModel, providerRegistry } from "../src/registry.ts";

test("MiniMax provider id, protocol, default model", () => {
  expect(minimaxProvider.id).toBe("minimax");
  expect(minimaxProvider.protocol).toBe("openai-compat");
  expect(minimaxProvider.defaultModel).toBe("MiniMax-M2.7");
});

test("MiniMax availableModels contain M2.7 and M2.7-highspeed", () => {
  const ids = (minimaxProvider.availableModels ?? []).map((m) => m.id);
  expect(ids).toContain("MiniMax-M2.7");
  expect(ids).toContain("MiniMax-M2.7-highspeed");
});

test("MiniMax M2.7 capability flags match an OpenAI-compat workhorse", () => {
  const cap = minimaxProvider.capability("MiniMax-M2.7");
  expect(cap.requiresReasoningReplay).toBe(false);
  expect(cap.supportsThinking).toBe(false);
  expect(cap.supportsToolUse).toBe(true);
  expect(cap.supportsCacheControl).toBe(false);
  expect(cap.payloadMode).toBe("chat-completions");
  // 204K ctx / 192K output per platform.minimax.io/docs/api-reference.
  expect(cap.contextWindow).toBe(204_800);
  expect(cap.maxOutput).toBe(192_000);
});

test("MiniMax M2.7 has highspeed as the /fast variant; highspeed itself has no sibling", () => {
  expect(minimaxProvider.capability("MiniMax-M2.7").fastVariant).toBe(
    "MiniMax-M2.7-highspeed",
  );
  expect(minimaxProvider.capability("MiniMax-M2.7-highspeed").fastVariant).toBeUndefined();
});

test("MiniMax createClient returns a non-null object without hitting the network", () => {
  const client = minimaxProvider.createClient("MiniMax-M2.7", { apiKey: "sk-test" });
  expect(client).toBeDefined();
  expect(client).not.toBeNull();
});

test("registry resolves MiniMax id directly", () => {
  expect(providerRegistry.has("minimax")).toBe(true);
  expect(providerRegistry.get("minimax")?.id).toBe("minimax");
});

test("providerByModel routes MiniMax-* to the MiniMax provider", () => {
  expect(providerByModel("MiniMax-M2.7")?.id).toBe("minimax");
  expect(providerByModel("MiniMax-M2.7-highspeed")?.id).toBe("minimax");
});
