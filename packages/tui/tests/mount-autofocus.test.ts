// Regression: opentui's renderer defaults autoFocus to TRUE, which makes
// every left-mouse-click walk up the renderable tree and focus the first
// `focusable` ancestor. ScrollBoxRenderable._focusable is true, so a single
// click anywhere in the transcript steals focus from the always-focused
// composer Input — and Composer's `focused={true}` is a static prop, so
// Solid never re-applies it on subsequent renders. Net effect: after any
// long output (`/skills`, `/help`, an assistant turn the user wants to
// select-copy), one click in the transcript makes the TUI go deaf to all
// keystrokes until restart.
//
// Fix: pass `autoFocus: false` to `createCliRenderer` in `mount.tsx`. We
// have exactly one always-focused Input — click-to-focus is dead weight,
// and wheel scroll is routed by cursor position regardless of focus.
//
// This test reads the source so the option can't silently disappear in a
// future refactor.

import { test, expect } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";

test("mount.tsx pins autoFocus: false to prevent ScrollBox click stealing composer focus", () => {
  const src = readFileSync(
    join(import.meta.dir, "..", "src", "mount.tsx"),
    "utf8",
  );
  // The option must appear inside the createCliRenderer({...}) call. We
  // can't AST-parse here without pulling a TS toolchain into a unit test,
  // but a substring check is enough — the comment block above the option
  // explains why a future contributor must not delete it.
  expect(src).toMatch(/createCliRenderer\(\{[\s\S]*autoFocus:\s*false[\s\S]*\}\)/);
});
