// G_phase1 — provider availableModels picker contract.
//
// Asserts the V4-flash default + invariants on every provider that exposes
// a non-empty availableModels list (defaultModel must be in the list).

import { expect, test } from "bun:test";
import { deepseekProvider, listProviders, mikanProvider } from "../src/index.ts";

test("mikan availableModels includes V4 flash + V4 pro", () => {
  const ids = (mikanProvider.availableModels ?? []).map((m) => m.id);
  expect(ids).toContain("deepseek-v4-flash");
  expect(ids).toContain("deepseek-v4-pro");
});

test("mikan defaultModel is deepseek-v4-flash", () => {
  expect(mikanProvider.defaultModel).toBe("deepseek-v4-flash");
});

test("deepseek defaultModel is deepseek-v4-flash", () => {
  expect(deepseekProvider.defaultModel).toBe("deepseek-v4-flash");
});

test("every provider with availableModels has non-empty list AND default is in it", () => {
  for (const p of listProviders()) {
    if (p.availableModels === undefined) continue;
    expect(p.availableModels.length).toBeGreaterThan(0);
    const ids = p.availableModels.map((m) => m.id);
    expect(ids).toContain(p.defaultModel);
  }
});
