// Meta-test: every `action: "..."` literal emitted by a command in
// `packages/command/src/cmds/*.ts` must appear in the `SlashActionVerb`
// union exported by `runtime-switch.ts`. Without this guard, a contributor
// can add a new action verb in cmds/, see the confirmation text appear in
// the TUI, and ship a silently-broken command (this is exactly the bug
// pattern that left 11 commands as decorative no-ops before the
// applyCommandResult exhaustive-switch refactor).
//
// The TS exhaustive `never` check inside applyCommandResult covers the
// CONSUMER side — if the union has a verb without a case, the build
// fails. THIS test covers the PRODUCER side — if cmds/ emits a verb that
// isn't in the union, this test fails.
//
// Together they form the closed loop: emitter ↔ union ↔ consumer.

import { test, expect } from "bun:test";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

const CMDS_DIR = join(import.meta.dir, "..", "..", "command", "src", "cmds");
const RUNTIME_SWITCH = join(import.meta.dir, "..", "src", "runtime-switch.ts");

function collectEmittedActions(): Set<string> {
  const verbs = new Set<string>();
  for (const entry of readdirSync(CMDS_DIR)) {
    if (!entry.endsWith(".ts")) continue;
    const src = readFileSync(join(CMDS_DIR, entry), "utf8");
    // Match `action: "verb"` — both single and double quotes, allow
    // surrounding whitespace. Templates / dynamic strings are out of
    // scope; the existing codebase only uses string literals.
    const re = /action:\s*["']([a-z][\w-]*)["']/g;
    let match: RegExpExecArray | null;
    // biome-ignore lint/suspicious/noAssignInExpressions: idiomatic regex loop.
    while ((match = re.exec(src)) !== null) {
      const verb = match[1];
      if (verb) verbs.add(verb);
    }
  }
  return verbs;
}

function collectUnionVerbs(): Set<string> {
  const src = readFileSync(RUNTIME_SWITCH, "utf8");
  const start = src.indexOf("export type SlashActionVerb");
  if (start < 0) throw new Error("SlashActionVerb union not found in runtime-switch.ts");
  const end = src.indexOf(";", start);
  const block = src.slice(start, end);
  const verbs = new Set<string>();
  const re = /["']([a-z][\w-]*)["']/g;
  let match: RegExpExecArray | null;
  // biome-ignore lint/suspicious/noAssignInExpressions: idiomatic regex loop.
  while ((match = re.exec(block)) !== null) {
    const verb = match[1];
    if (verb) verbs.add(verb);
  }
  return verbs;
}

test("every action verb emitted by cmds/*.ts is declared in SlashActionVerb", () => {
  const emitted = collectEmittedActions();
  const declared = collectUnionVerbs();

  // Sanity: producer set is non-empty (otherwise we silently pass when
  // the regex breaks).
  expect(emitted.size).toBeGreaterThan(5);

  const missing = [...emitted].filter((v) => !declared.has(v)).sort();
  expect(missing).toEqual([]);
});

test("every SlashActionVerb is actually emitted by some command (no dead verbs)", () => {
  // Reverse direction: catch verbs that linger in the union after the
  // command that emitted them was deleted. Dead verbs hide the same
  // class of regression as silent fall-through, just from the other
  // side.
  const emitted = collectEmittedActions();
  const declared = collectUnionVerbs();

  const orphans = [...declared].filter((v) => !emitted.has(v)).sort();
  expect(orphans).toEqual([]);
});

test("set-color / toggle-debug / install-skill / compact-session / toggle-fast / set-theme / toggle-vim have moved out of the D-class block (T2/T3/T4 + batch 2 + batch 3)", () => {
  // Regression guard for the post-v1.0 #3 + batch-2 + batch-3 wiring
  // passes: these seven verbs were in the "(not yet wired)" stock-text
  // fall-through block. They MUST now appear in their own A/B/C cases so
  // users get real behavior.
  const src = readFileSync(RUNTIME_SWITCH, "utf8");
  // Find the fall-through block (D-class) — match the comment header.
  const dStart = src.indexOf('// ---- D. Not yet implemented');
  expect(dStart).toBeGreaterThan(0);
  // The D-block extends to the end of the function body — anchor on the
  // closing brace of the switch by finding the block of consecutive `case`
  // lines after the comment until the next `}`.
  const dRest = src.slice(dStart);
  const dEnd = dRest.indexOf("default:");
  const dBlock = dRest.slice(0, dEnd);
  expect(dBlock).not.toContain('"set-color"');
  expect(dBlock).not.toContain('"toggle-debug"');
  expect(dBlock).not.toContain('"install-skill"');
  expect(dBlock).not.toContain('"compact-session"');
  expect(dBlock).not.toContain('"toggle-fast"');
  expect(dBlock).not.toContain('"set-theme"');
  expect(dBlock).not.toContain('"toggle-vim"');
});

test("D-class block is now empty after batch-3 (no `case` lines between the D header and default)", () => {
  // After batch-3 every verb in the union has a real handler in A/B/C.
  // The D-block stays in source as a documented placeholder for the next
  // stub command, but it must NOT carry any `case "...":` lines today.
  // The next contributor adding a stub will trip THIS test (instead of
  // shipping a silent no-op) and have to wire the verb through ctx.
  const src = readFileSync(RUNTIME_SWITCH, "utf8");
  const dStart = src.indexOf('// ---- D. Not yet implemented');
  expect(dStart).toBeGreaterThan(0);
  const dRest = src.slice(dStart);
  const dEnd = dRest.indexOf("default:");
  const dBlock = dRest.slice(0, dEnd);
  // Strip the comment line itself, then assert no `case "...":` literals
  // remain in the residual block.
  const afterHeader = dBlock.slice(dBlock.indexOf("\n") + 1);
  const caseRe = /case\s+["'][a-z][\w-]*["']\s*:/g;
  const remaining = afterHeader.match(caseRe) ?? [];
  expect(remaining).toEqual([]);
});

test("SlashContext exposes new hooks for color / debug-log / install-skill / theme / vim (T2/T3/T4 + batch-3)", () => {
  // Wires-not-broken sniff: dispatchSlash needs these hooks to route the
  // verbs above to real ctx behavior.
  const src = readFileSync(RUNTIME_SWITCH, "utf8");
  const ctxStart = src.indexOf("export interface SlashContext");
  expect(ctxStart).toBeGreaterThan(0);
  const ctxEnd = src.indexOf("\n}", ctxStart);
  const ctxBlock = src.slice(ctxStart, ctxEnd);
  expect(ctxBlock).toContain("setColorMode");
  expect(ctxBlock).toContain("appendDebugLog");
  expect(ctxBlock).toContain("installSkill");
  expect(ctxBlock).toContain("setTheme");
  expect(ctxBlock).toContain("setVim");
});
