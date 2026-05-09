// fastVariant — post-v1.0 D-class /fast wiring (capability map).
//
// Every provider that opts into /fast MUST surface a `fastVariant`
// string on the heavy/mid model and undefined on the cheap sibling.
// The CLI uses this to decide per-turn whether to swap the outbound
// model id; absent fastVariant means /fast is a no-op for that model.

import { expect, test } from "bun:test";
import { anthropicProvider } from "../src/providers/anthropic.ts";
import { deepseekProvider } from "../src/providers/deepseek.ts";
import { deepseekCnProvider } from "../src/providers/deepseek-cn.ts";
import { openaiProvider } from "../src/providers/openai.ts";
import { mikanProvider } from "../src/providers/mikan.ts";

test("anthropic: claude-opus-4-7 → claude-haiku-4-5", () => {
  const cap = anthropicProvider.capability("claude-opus-4-7");
  expect(cap.fastVariant).toBe("claude-haiku-4-5");
});

test("anthropic: claude-sonnet-4-6 → claude-haiku-4-5", () => {
  const cap = anthropicProvider.capability("claude-sonnet-4-6");
  expect(cap.fastVariant).toBe("claude-haiku-4-5");
});

test("anthropic: claude-haiku-4-5 has no fastVariant (cheapest sibling)", () => {
  const cap = anthropicProvider.capability("claude-haiku-4-5");
  expect(cap.fastVariant).toBeUndefined();
});

test("deepseek: deepseek-v4-pro → deepseek-v4-flash", () => {
  const cap = deepseekProvider.capability("deepseek-v4-pro");
  expect(cap.fastVariant).toBe("deepseek-v4-flash");
});

test("deepseek: deepseek-v4-flash has no fastVariant (workhorse)", () => {
  const cap = deepseekProvider.capability("deepseek-v4-flash");
  expect(cap.fastVariant).toBeUndefined();
});

test("deepseek-cn: deepseek-v4-pro → deepseek-v4-flash (mirrors international)", () => {
  const cap = deepseekCnProvider.capability("deepseek-v4-pro");
  expect(cap.fastVariant).toBe("deepseek-v4-flash");
});

test("openai: gpt-5.2 → gpt-4o-mini", () => {
  const cap = openaiProvider.capability("gpt-5.2");
  expect(cap.fastVariant).toBe("gpt-4o-mini");
});

test("openai: gpt-4o → gpt-4o-mini", () => {
  const cap = openaiProvider.capability("gpt-4o");
  expect(cap.fastVariant).toBe("gpt-4o-mini");
});

test("openai: gpt-4o-mini has no fastVariant (cheapest sibling)", () => {
  const cap = openaiProvider.capability("gpt-4o-mini");
  expect(cap.fastVariant).toBeUndefined();
});

test("mikan: deepseek-v4-pro → deepseek-v4-flash", () => {
  const cap = mikanProvider.capability("deepseek-v4-pro");
  expect(cap.fastVariant).toBe("deepseek-v4-flash");
});

test("mikan: claude-sonnet-4-6 → gpt-4o-mini (cheapest cross-family sibling)", () => {
  const cap = mikanProvider.capability("claude-sonnet-4-6");
  expect(cap.fastVariant).toBe("gpt-4o-mini");
});

test("mikan: gemini-3-pro-preview → gemini-3-flash-preview", () => {
  const cap = mikanProvider.capability("gemini-3-pro-preview");
  expect(cap.fastVariant).toBe("gemini-3-flash-preview");
});

test("mikan: deepseek-v4-flash has no fastVariant", () => {
  const cap = mikanProvider.capability("deepseek-v4-flash");
  expect(cap.fastVariant).toBeUndefined();
});
