import { test, expect } from "bun:test";
import { validateSubmit } from "../src/composer-logic.ts";

test("rejects empty string", () => {
  const r = validateSubmit("");
  expect(r.valid).toBe(false);
  expect(r.reason).toBe("empty");
});

test("rejects pure whitespace", () => {
  const r = validateSubmit("   \t  ");
  expect(r.valid).toBe(false);
  expect(r.reason).toBe("whitespace");
});

test("accepts plain text", () => {
  expect(validateSubmit("hi")).toEqual({ valid: true });
});

test("accepts text with leading/trailing whitespace", () => {
  expect(validateSubmit("  question  ").valid).toBe(true);
});

test("accepts multiline payload (paste case)", () => {
  expect(validateSubmit("line one\nline two").valid).toBe(true);
});
