import { expect, test } from "bun:test";
import sleep from "../src/tools/sleep.ts";
import { makeCtx, makeTmpDir } from "./helpers.ts";

test("sleep returns immediately for ms=0", async () => {
  const result = await sleep.call({ ms: 0 }, makeCtx(makeTmpDir("openseek-sleep-")));
  expect(result.kind).toBe("text");
  if (result.kind !== "text") throw new Error("unreachable");
  expect(result.text).toBe("[slept 0ms]");
});

test("sleep waits ~ms milliseconds", async () => {
  const start = Date.now();
  const result = await sleep.call({ ms: 50 }, makeCtx(makeTmpDir("openseek-sleep-")));
  const elapsed = Date.now() - start;
  expect(elapsed).toBeGreaterThanOrEqual(40); // small jitter tolerance
  expect(result.kind).toBe("text");
  if (result.kind !== "text") throw new Error("unreachable");
  expect(result.text).toMatch(/^\[slept \d+ms\]$/);
});

test("sleep aborts early when ctx.abort fires", async () => {
  const ac = new AbortController();
  const ctx = makeCtx(makeTmpDir("openseek-sleep-"), { abort: ac.signal });
  const p = sleep.call({ ms: 5_000 }, ctx);
  setTimeout(() => ac.abort(), 30);
  const result = await p;
  expect(result.kind).toBe("text");
  if (result.kind !== "text") throw new Error("unreachable");
  expect(result.text).toContain("interrupted by abort");
});
