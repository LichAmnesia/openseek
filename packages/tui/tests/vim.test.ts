import { test, expect } from "bun:test";
import { applyVimKey, createVimState } from "../src/vim.ts";

test("starts in insert mode, Esc switches to normal", () => {
  const s0 = createVimState(["hello"]);
  expect(s0.mode).toBe("insert");
  const r = applyVimKey(s0, { key: "Escape" });
  expect(r.state.mode).toBe("normal");
  expect(r.action).toEqual({ kind: "mode", mode: "normal" });
});

test("normal → 'i' returns to insert", () => {
  let s = createVimState(["x"]);
  s = applyVimKey(s, { key: "Escape" }).state;
  const r = applyVimKey(s, { key: "i" });
  expect(r.state.mode).toBe("insert");
  expect(r.action?.kind).toBe("mode");
});

test("hjkl move the cursor inside bounds", () => {
  let s = createVimState(["abc", "defg", "h"]);
  s = applyVimKey(s, { key: "Escape" }).state;
  s = applyVimKey(s, { key: "l" }).state;
  s = applyVimKey(s, { key: "l" }).state;
  expect(s.col).toBe(2);
  s = applyVimKey(s, { key: "j" }).state;
  expect(s.row).toBe(1);
  s = applyVimKey(s, { key: "h" }).state;
  expect(s.col).toBe(1);
  s = applyVimKey(s, { key: "k" }).state;
  expect(s.row).toBe(0);
});

test("hjkl clamp at edges and tolerate the empty buffer", () => {
  let s = createVimState([""]);
  s = applyVimKey(s, { key: "Escape" }).state;
  s = applyVimKey(s, { key: "h" }).state;
  s = applyVimKey(s, { key: "k" }).state;
  expect(s.row).toBe(0);
  expect(s.col).toBe(0);
});

test("dd cuts the current line into the register", () => {
  let s = createVimState(["alpha", "beta", "gamma"]);
  s = applyVimKey(s, { key: "Escape" }).state;
  const r1 = applyVimKey(s, { key: "d" });
  expect(r1.state.pending).toBe("d");
  const r2 = applyVimKey(r1.state, { key: "d" });
  expect(r2.state.lines).toEqual(["beta", "gamma"]);
  expect(r2.state.register).toBe("alpha");
  expect(r2.state.registerLinewise).toBe(true);
  expect(r2.action).toEqual({ kind: "delete-line", row: 0, text: "alpha" });
});

test("yy + p duplicate a line below the cursor", () => {
  let s = createVimState(["alpha", "beta"]);
  s = applyVimKey(s, { key: "Escape" }).state;
  s = applyVimKey(s, { key: "y" }).state;
  s = applyVimKey(s, { key: "y" }).state;
  expect(s.register).toBe("alpha");
  s = applyVimKey(s, { key: "p" }).state;
  expect(s.lines).toEqual(["alpha", "alpha", "beta"]);
  expect(s.row).toBe(1);
});

test("dw deletes a word from the cursor", () => {
  let s = createVimState(["hello world tail"]);
  s = applyVimKey(s, { key: "Escape" }).state;
  s = applyVimKey(s, { key: "d" }).state;
  s = applyVimKey(s, { key: "w" }).state;
  expect(s.lines[0]).toBe("world tail");
  expect(s.register).toBe("hello ");
  expect(s.registerLinewise).toBe(false);
});

test("repeat prefix multiplies a motion", () => {
  let s = createVimState(["abcdefg"]);
  s = applyVimKey(s, { key: "Escape" }).state;
  s = applyVimKey(s, { key: "3" }).state;
  expect(s.repeat).toBe(3);
  s = applyVimKey(s, { key: "l" }).state;
  expect(s.col).toBe(3);
  expect(s.repeat).toBe(0);
});

test("insert-mode typing inserts characters at the cursor", () => {
  let s = createVimState([""]);
  s = applyVimKey(s, { key: "h" }).state;
  s = applyVimKey(s, { key: "i" }).state;
  expect(s.lines[0]).toBe("hi");
  expect(s.col).toBe(2);
  expect(s.mode).toBe("insert");
});

test("unknown normal-mode keys fall through as a noop", () => {
  let s = createVimState(["x"]);
  s = applyVimKey(s, { key: "Escape" }).state;
  const r = applyVimKey(s, { key: "Q" });
  expect(r.action).toEqual({ kind: "noop", reason: "normal:Q" });
  expect(r.state.lines).toEqual(["x"]);
});
