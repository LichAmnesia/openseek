import { expect, test } from "bun:test";
import { parseCron } from "../src/cron.ts";

test("parseCron handles @hourly", () => {
  const p = parseCron("@hourly");
  expect(p.canonical).toBe("0 * * * *");
  // Next run should be top of next hour
  const from = Date.UTC(2026, 0, 1, 12, 30, 0);
  const next = p.nextRun(from);
  const d = new Date(next);
  expect(d.getUTCMinutes()).toBe(0);
  expect(d.getUTCHours()).toBe(13);
});

test("parseCron handles @daily", () => {
  const p = parseCron("@daily");
  expect(p.canonical).toBe("0 0 * * *");
  const from = Date.UTC(2026, 0, 1, 12, 30, 0);
  const next = p.nextRun(from);
  const d = new Date(next);
  expect(d.getUTCHours()).toBe(0);
  expect(d.getUTCMinutes()).toBe(0);
  expect(d.getUTCDate()).toBe(2);
});

test("parseCron handles @weekly = Sunday 00:00 UTC", () => {
  const p = parseCron("@weekly");
  // 2026-01-01 was Thu, next Sun is 2026-01-04
  const from = Date.UTC(2026, 0, 1, 12, 0, 0);
  const next = p.nextRun(from);
  const d = new Date(next);
  expect(d.getUTCDay()).toBe(0);
  expect(d.getUTCHours()).toBe(0);
  expect(d.getUTCMinutes()).toBe(0);
});

test("parseCron handles every-N minutes", () => {
  const p = parseCron("*/5 * * * *");
  const from = Date.UTC(2026, 0, 1, 12, 31, 0);
  const next = p.nextRun(from);
  const d = new Date(next);
  expect(d.getUTCMinutes()).toBe(35);
});

test("parseCron handles fixed M H * * *", () => {
  const p = parseCron("30 14 * * *");
  const from = Date.UTC(2026, 0, 1, 12, 0, 0);
  const next = p.nextRun(from);
  const d = new Date(next);
  expect(d.getUTCHours()).toBe(14);
  expect(d.getUTCMinutes()).toBe(30);
});

test("parseCron rejects empty input", () => {
  expect(() => parseCron("")).toThrow();
  expect(() => parseCron("   ")).toThrow();
});

test("parseCron rejects unsupported expressions", () => {
  expect(() => parseCron("0 0 1 * *")).toThrow(); // dom != *
  expect(() => parseCron("0 0 * 1 *")).toThrow(); // month != *
  expect(() => parseCron("nonsense")).toThrow();
  expect(() => parseCron("0 25 * * *")).toThrow(); // hour out of range
  expect(() => parseCron("60 0 * * *")).toThrow(); // minute out of range
  expect(() => parseCron("*/0 * * * *")).toThrow();
  expect(() => parseCron("*/100 * * * *")).toThrow();
});

test("parseCron next-run is strictly after the input time", () => {
  const p = parseCron("0 * * * *");
  const from = Date.UTC(2026, 0, 1, 12, 0, 0);
  const next = p.nextRun(from);
  expect(next).toBeGreaterThan(from);
});
