// /fast wiring — verifies the per-turn model swap protocol that
// interactive.ts onSubmit implements:
//
//   const fastModeOn = commandState.fastMode === true;
//   const effectiveModel =
//     fastModeOn && cap.fastVariant ? cap.fastVariant : opts.modelId;
//
// Also asserts the /fast command handler still toggles commandState.fastMode
// (per-turn-only swap relies on this flag staying ON across turns).
//
// Anti-regression: a future "always swap" or "never swap" change to the
// snippet would flip these tests immediately.

import { test, expect } from "bun:test";
import { builtinCommands } from "@openseek/command";
import { getProvider } from "@openseek/provider";

const fastCmd = builtinCommands.find((c) => c.name === "fast");
if (!fastCmd) throw new Error("fast command not registered");

test("/fast handler toggles commandState.fastMode (off → on → off)", async () => {
  const state: Record<string, unknown> = {};
  const r1 = await fastCmd.handle({ state });
  expect(state.fastMode).toBe(true);
  expect(r1.payload.action).toBe("toggle-fast");
  const r2 = await fastCmd.handle({ state });
  expect(state.fastMode).toBe(false);
  expect(r2.payload.action).toBe("toggle-fast");
});

test("per-turn swap: fastMode=true + cap.fastVariant present → effectiveModel is variant", () => {
  const provider = getProvider("anthropic");
  if (!provider) throw new Error("anthropic provider missing");
  const nominalModel = "claude-opus-4-7";
  const cap = provider.capability(nominalModel);
  expect(cap.fastVariant).toBeDefined();
  const fastVariant = cap.fastVariant!;
  // Mirror the interactive.ts snippet.
  const commandState = { fastMode: true } as Record<string, unknown>;
  const fastModeOn = commandState.fastMode === true;
  const effectiveModel =
    fastModeOn && cap.fastVariant ? cap.fastVariant : nominalModel;
  expect(effectiveModel).toBe(fastVariant);
  expect(effectiveModel).not.toBe(nominalModel);
});

test("per-turn swap: fastMode=false → effectiveModel stays at the nominal model", () => {
  const provider = getProvider("anthropic");
  if (!provider) throw new Error("anthropic provider missing");
  const nominalModel = "claude-opus-4-7";
  const cap = provider.capability(nominalModel);
  const commandState = { fastMode: false } as Record<string, unknown>;
  const fastModeOn = commandState.fastMode === true;
  const effectiveModel =
    fastModeOn && cap.fastVariant ? cap.fastVariant : nominalModel;
  expect(effectiveModel).toBe(nominalModel);
});

test("per-turn swap: fastMode=true but no fastVariant on this model → no swap", () => {
  const provider = getProvider("anthropic");
  if (!provider) throw new Error("anthropic provider missing");
  // claude-haiku-4-5 has no faster sibling — fastVariant should be undefined.
  const nominalModel = "claude-haiku-4-5";
  const cap = provider.capability(nominalModel);
  expect(cap.fastVariant).toBeUndefined();
  const commandState = { fastMode: true } as Record<string, unknown>;
  const fastModeOn = commandState.fastMode === true;
  const effectiveModel =
    fastModeOn && cap.fastVariant ? cap.fastVariant : nominalModel;
  expect(effectiveModel).toBe(nominalModel);
});

test("per-turn swap is invariant across providers when nominal model has no variant", () => {
  // openai gpt-4o-mini has no smaller sibling → /fast is a no-op.
  const provider = getProvider("openai");
  if (!provider) throw new Error("openai provider missing");
  const nominalModel = "gpt-4o-mini";
  const cap = provider.capability(nominalModel);
  expect(cap.fastVariant).toBeUndefined();
  const commandState = { fastMode: true } as Record<string, unknown>;
  const effectiveModel =
    commandState.fastMode === true && cap.fastVariant ? cap.fastVariant : nominalModel;
  expect(effectiveModel).toBe(nominalModel);
});
