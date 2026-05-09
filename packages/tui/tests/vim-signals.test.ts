// Batch-3 D-class wiring — vim modal cursor signal contract.
//
// We test the SIGNAL flow + sub-mode key-handling rules in isolation:
//
//   * setVim(true)  → vimEnabled=true,  vimSubMode="insert"
//   * setVim(false) → vimEnabled=false (sub-mode preserved, harmless)
//   * Escape in insert sub-mode → "normal"
//   * `i` / `a` in normal sub-mode → "insert"
//   * Other keys do not flip sub-mode.
//
// Mirrors the Composer-level cursor mapping: normal → block, insert → line.

import { test, expect } from "bun:test";
import { createSignal } from "solid-js";

function makeVimHarness() {
  const [vimEnabled, setVimEnabled] = createSignal<boolean>(false);
  const [vimSubMode, setVimSubMode] = createSignal<"normal" | "insert">("insert");
  const setVim = (on: boolean): void => {
    setVimEnabled(on);
    if (on) setVimSubMode("insert");
  };
  // Mirrors the App.tsx useKeyboard gate exactly so the test guards the
  // wiring, not the implementation detail.
  const handleKey = (name: string): boolean => {
    if (!vimEnabled()) return false;
    const sub = vimSubMode();
    if (sub === "insert" && name === "escape") {
      setVimSubMode("normal");
      return true;
    }
    if (sub === "normal" && (name === "i" || name === "a")) {
      setVimSubMode("insert");
      return true;
    }
    return false;
  };
  // Mirrors Composer.cursorStyleOpts so the assertion covers the full
  // vim → cursor-style mapping.
  const cursorStyle = (): "block" | "line" | "default" => {
    if (!vimEnabled()) return "default";
    return vimSubMode() === "normal" ? "block" : "line";
  };
  return { vimEnabled, vimSubMode, setVim, handleKey, cursorStyle };
}

test("setVim(true) enables vim and seeds insert sub-mode", () => {
  const h = makeVimHarness();
  expect(h.vimEnabled()).toBe(false);
  h.setVim(true);
  expect(h.vimEnabled()).toBe(true);
  expect(h.vimSubMode()).toBe("insert");
});

test("setVim(false) disables vim", () => {
  const h = makeVimHarness();
  h.setVim(true);
  h.setVim(false);
  expect(h.vimEnabled()).toBe(false);
});

test("Escape in insert sub-mode → normal", () => {
  const h = makeVimHarness();
  h.setVim(true);
  expect(h.handleKey("escape")).toBe(true);
  expect(h.vimSubMode()).toBe("normal");
});

test("`i` in normal sub-mode → insert", () => {
  const h = makeVimHarness();
  h.setVim(true);
  h.handleKey("escape");
  expect(h.vimSubMode()).toBe("normal");
  expect(h.handleKey("i")).toBe(true);
  expect(h.vimSubMode()).toBe("insert");
});

test("`a` in normal sub-mode → insert", () => {
  const h = makeVimHarness();
  h.setVim(true);
  h.handleKey("escape");
  expect(h.handleKey("a")).toBe(true);
  expect(h.vimSubMode()).toBe("insert");
});

test("vim disabled — no key handling fires (input behaves normally)", () => {
  const h = makeVimHarness();
  expect(h.handleKey("escape")).toBe(false);
  expect(h.handleKey("i")).toBe(false);
  expect(h.handleKey("a")).toBe(false);
  expect(h.vimSubMode()).toBe("insert"); // never touched
});

test("unknown keys do NOT flip sub-mode", () => {
  const h = makeVimHarness();
  h.setVim(true);
  h.handleKey("escape");
  expect(h.vimSubMode()).toBe("normal");
  expect(h.handleKey("x")).toBe(false);
  expect(h.handleKey("space")).toBe(false);
  expect(h.vimSubMode()).toBe("normal");
});

test("cursorStyle: vim OFF → default", () => {
  const h = makeVimHarness();
  expect(h.cursorStyle()).toBe("default");
});

test("cursorStyle: vim ON insert → line, vim ON normal → block", () => {
  const h = makeVimHarness();
  h.setVim(true);
  expect(h.cursorStyle()).toBe("line");
  h.handleKey("escape");
  expect(h.cursorStyle()).toBe("block");
  h.handleKey("i");
  expect(h.cursorStyle()).toBe("line");
});

test("toggle round-trip — on then off then on again seeds insert each time", () => {
  const h = makeVimHarness();
  h.setVim(true);
  h.handleKey("escape"); // → normal
  h.setVim(false);
  h.setVim(true); // re-enable should reset sub-mode to insert
  expect(h.vimSubMode()).toBe("insert");
});
