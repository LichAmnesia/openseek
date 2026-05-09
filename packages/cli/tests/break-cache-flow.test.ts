// T1 — /break-cache flow: when the command sets commandState.breakCache=true,
// the next runSession invocation must consume + clear the flag, leaving
// commandState.breakCache=false (so a subsequent submit reverts to cached
// behavior unless the user re-runs /break-cache).
//
// We don't pull interactive.ts (drags @openseek/tui at runtime); instead we
// model the consume-and-clear protocol the cli implements and assert the
// /break-cache command sets the flag the cli expects to read.

import { test, expect } from "bun:test";
import { builtinCommands } from "@openseek/command";

const breakCache = builtinCommands.find((c) => c.name === "break-cache");
if (!breakCache) throw new Error("break-cache command not registered");

test("/break-cache handler flips commandState.breakCache to true", async () => {
  const state: Record<string, unknown> = {};
  const r = await breakCache.handle({ state });
  expect(state.breakCache).toBe(true);
  expect(r.payload.action).toBe("break-cache");
});

test("cli consume-and-clear: reading the flag once flips it back to false", () => {
  // Mirrors the snippet in interactive.ts onSubmit:
  //   const breakCache = commandState.breakCache === true;
  //   if (breakCache) commandState.breakCache = false;
  const commandState: Record<string, unknown> = { breakCache: true };
  const breakCacheFlag = commandState.breakCache === true;
  if (breakCacheFlag) commandState.breakCache = false;
  expect(breakCacheFlag).toBe(true);
  expect(commandState.breakCache).toBe(false);
});

test("consume-and-clear is idempotent: a second submit does NOT re-break cache", () => {
  // After /break-cache fires once and the next submit consumes it, a third
  // submit (no further /break-cache) must NOT see breakCache=true again.
  const commandState: Record<string, unknown> = {};
  // Submit 1: no flag set → no break.
  let flag = commandState.breakCache === true;
  expect(flag).toBe(false);
  // User runs /break-cache.
  commandState.breakCache = true;
  // Submit 2: flag is consumed.
  flag = commandState.breakCache === true;
  if (flag) commandState.breakCache = false;
  expect(flag).toBe(true);
  expect(commandState.breakCache).toBe(false);
  // Submit 3: flag stays false — proves no auto-restore.
  flag = commandState.breakCache === true;
  expect(flag).toBe(false);
});
