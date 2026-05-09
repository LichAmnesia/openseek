import { test, expect } from "bun:test";
import type { OpenSeekMessage } from "@openseek/provider";
import {
  BUILTIN_OUTPUT_STYLES,
  OUTPUT_STYLE_IDS,
  applyOutputStyle,
  getOutputStyleSpec,
  isOutputStyle,
} from "../src/output-styles.ts";

test("ships exactly five built-in output styles", () => {
  expect(BUILTIN_OUTPUT_STYLES).toHaveLength(5);
  expect([...OUTPUT_STYLE_IDS]).toEqual([
    "default",
    "concise",
    "verbose",
    "pirate",
    "sarcastic",
  ]);
});

test("each style spec carries id, label, and a non-empty system prompt", () => {
  for (const spec of BUILTIN_OUTPUT_STYLES) {
    expect(spec.id).toBeTruthy();
    expect(spec.label).toBeTruthy();
    expect(spec.systemPrompt.length).toBeGreaterThanOrEqual(20);
    expect(spec.systemPrompt.length).toBeLessThanOrEqual(220);
  }
});

test("isOutputStyle matches the registry", () => {
  expect(isOutputStyle("pirate")).toBe(true);
  expect(isOutputStyle("default")).toBe(true);
  expect(isOutputStyle("klingon")).toBe(false);
});

test("getOutputStyleSpec round-trips known ids and throws on unknown", () => {
  expect(getOutputStyleSpec("sarcastic").id).toBe("sarcastic");
  expect(() => getOutputStyleSpec("klingon" as never)).toThrow(/unknown/);
});

test("applyOutputStyle prepends a system message tagged with the style", () => {
  const messages: OpenSeekMessage[] = [
    { role: "user", content: [{ type: "text", text: "hi" }] },
  ];
  const out = applyOutputStyle(messages, "pirate");
  expect(out).toHaveLength(2);
  expect(out[0]?.role).toBe("system");
  const block = out[0]?.content[0];
  expect(block && "text" in block ? block.text : "").toContain("pirate");
  expect(out[1]).toEqual(messages[0] as OpenSeekMessage);
});

test("switching styles replaces the prior style header in place", () => {
  const base: OpenSeekMessage[] = [
    { role: "user", content: [{ type: "text", text: "hi" }] },
  ];
  const once = applyOutputStyle(base, "pirate");
  const twice = applyOutputStyle(once, "concise");
  expect(twice).toHaveLength(2);
  const head = twice[0]?.content[0];
  expect(head && "text" in head ? head.text : "").toContain("Be terse");
});

test("applying 'default' strips a prior style header without reinjecting", () => {
  const base: OpenSeekMessage[] = [
    { role: "user", content: [{ type: "text", text: "hi" }] },
  ];
  const once = applyOutputStyle(base, "verbose");
  const reset = applyOutputStyle(once, "default");
  expect(reset).toHaveLength(1);
  expect(reset[0]?.role).toBe("user");
});

test("applyOutputStyle throws on unknown style id", () => {
  expect(() => applyOutputStyle([], "klingon" as never)).toThrow(/unknown/);
});

test("applyOutputStyle does not mutate the input array", () => {
  const messages: OpenSeekMessage[] = [
    { role: "user", content: [{ type: "text", text: "hi" }] },
  ];
  const before = messages.length;
  applyOutputStyle(messages, "verbose");
  expect(messages.length).toBe(before);
});
