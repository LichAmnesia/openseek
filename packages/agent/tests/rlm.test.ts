import { expect, test } from "bun:test";
import type { RlmRunner } from "../src/index.ts";
import { DEFAULT_RLM_MAX_PARALLEL, mockRunner, runRlm } from "../src/index.ts";

test("runRlm with single query returns one stub result", async () => {
  const out = await runRlm(["only"], { runner: mockRunner });
  expect(out.length).toBe(1);
  expect(out[0]?.query).toBe("only");
  expect(out[0]?.response).toBe("[mock response for: only]");
  expect(typeof out[0]?.ms).toBe("number");
});

test("runRlm fans out 3 queries, output order matches input", async () => {
  const queries = ["alpha", "beta", "gamma"];
  const out = await runRlm(queries, { runner: mockRunner });
  expect(out.length).toBe(3);
  expect(out.map((r) => r.query)).toEqual(queries);
});

test("runRlm handles 16 queries (the SPEC G3.2 ceiling)", async () => {
  const queries = Array.from({ length: 16 }, (_, i) => `q${i}`);
  const out = await runRlm(queries, { runner: mockRunner });
  expect(out.length).toBe(16);
  for (const r of out) expect(r.response.startsWith("[mock response for:")).toBe(true);
});

test("runRlm: a single failing query becomes [error: ...] but does not poison others", async () => {
  const runner: RlmRunner = async (q) => {
    if (q === "bad") throw new Error("boom");
    return `ok-${q}`;
  };
  const out = await runRlm(["a", "bad", "c"], { runner });
  expect(out[0]?.response).toBe("ok-a");
  expect(out[1]?.response).toBe("[error: boom]");
  expect(out[2]?.response).toBe("ok-c");
});

test("runRlm respects maxParallel: in-flight count never exceeds the cap", async () => {
  let inFlight = 0;
  let peak = 0;
  const runner: RlmRunner = async (q) => {
    inFlight += 1;
    peak = Math.max(peak, inFlight);
    // Yield to the event loop so all dispatches start before any settle.
    await new Promise<void>((resolve) => setTimeout(resolve, 5));
    inFlight -= 1;
    return q;
  };
  const queries = Array.from({ length: 8 }, (_, i) => `q${i}`);
  await runRlm(queries, { runner, maxParallel: 3 });
  expect(peak).toBeLessThanOrEqual(3);
  expect(peak).toBeGreaterThan(1);
});

test("runRlm default cap is 16", () => {
  expect(DEFAULT_RLM_MAX_PARALLEL).toBe(16);
});

test("runRlm captures elapsed ms per query", async () => {
  const runner: RlmRunner = async (q) => {
    await new Promise<void>((resolve) => setTimeout(resolve, 10));
    return q;
  };
  const out = await runRlm(["a", "b"], { runner });
  for (const r of out) expect(r.ms).toBeGreaterThanOrEqual(5);
});
