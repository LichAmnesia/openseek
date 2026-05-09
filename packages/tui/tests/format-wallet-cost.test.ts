import { test, expect } from "bun:test";
import { formatWalletCost } from "../src/App.tsx";

test("null balance renders as wallet:?", () => {
  expect(formatWalletCost(null, 0)).toBe(" · wallet:? · cost:$0.0000");
});

test("real balance renders 2-decimal USD", () => {
  expect(formatWalletCost(12.5, 0)).toBe(" · wallet:$12.50 · cost:$0.0000");
});

test("cost renders 4-decimal precision (sub-cent visibility)", () => {
  expect(formatWalletCost(5, 0.0123)).toBe(" · wallet:$5.00 · cost:$0.0123");
});

test("zero balance distinct from null balance", () => {
  expect(formatWalletCost(0, 0)).toBe(" · wallet:$0.00 · cost:$0.0000");
});

test("large numbers stay readable", () => {
  expect(formatWalletCost(1234.567, 9.876)).toBe(" · wallet:$1234.57 · cost:$9.8760");
});
