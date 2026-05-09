import { describe, expect, test } from "bun:test";
import { formatTokens } from "../src/format-tokens.ts";

describe("formatTokens", () => {
  test("zero stays as '0'", () => {
    expect(formatTokens(0)).toBe("0");
  });

  test("small ints under 1000 render as plain numbers", () => {
    expect(formatTokens(123)).toBe("123");
    expect(formatTokens(999)).toBe("999");
  });

  test("thousands under 10k get 1-decimal precision", () => {
    expect(formatTokens(1234)).toBe("1.2k");
    expect(formatTokens(1500)).toBe("1.5k");
    expect(formatTokens(9999)).toBe("10.0k");
  });

  test("thousands ≥10k drop the decimal", () => {
    expect(formatTokens(12345)).toBe("12k");
    expect(formatTokens(450000)).toBe("450k");
  });

  test("millions render with M suffix", () => {
    expect(formatTokens(1_500_000)).toBe("1.5M");
    expect(formatTokens(12_000_000)).toBe("12M");
  });

  test("non-finite + negative inputs degrade safely", () => {
    expect(formatTokens(Number.NaN)).toBe("?");
    expect(formatTokens(Number.POSITIVE_INFINITY)).toBe("?");
    expect(formatTokens(-5)).toBe("0");
  });
});
