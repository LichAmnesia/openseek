import { test, expect } from "bun:test";
import { builtinCommands, defaultRegistry } from "../src/index.ts";

test("builtinCommands.length === 108", () => {
  expect(builtinCommands.length).toBe(108);
});

test("all command names are unique", () => {
  const names = builtinCommands.map((c) => c.name);
  const set = new Set(names);
  expect(set.size).toBe(108);
});

test("defaultRegistry returns 108 entries", () => {
  const reg = defaultRegistry();
  expect(reg.size()).toBe(108);
});

test("real (non-stub) command count is at least 50", () => {
  const real = builtinCommands.filter((c) => !c.isStub);
  expect(real.length).toBeGreaterThanOrEqual(50);
});

test("ten categories covered with expected sizes", () => {
  const counts: Record<string, number> = {};
  for (const c of builtinCommands) {
    counts[c.category] = (counts[c.category] ?? 0) + 1;
  }
  // SPEC.md §D — 12 / 15 / 8 / 10 / 12 / 10 / 10 / 10 / 8 / 13 = 108
  expect(counts.session).toBe(12);
  expect(counts.config).toBe(15);
  expect(counts.auth).toBe(8);
  expect(counts.tools).toBe(10);
  expect(counts.git).toBe(12);
  expect(counts.agent).toBe(10);
  expect(counts.skills).toBe(10);
  expect(counts.diagnostics).toBe(10);
  expect(counts.ide).toBe(8);
  expect(counts.advanced).toBe(13);
});
