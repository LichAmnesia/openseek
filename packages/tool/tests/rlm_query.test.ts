import { expect, test } from "bun:test";
import rlmQuery from "../src/tools/rlm_query.ts";
import { makeCtx, makeTmpDir } from "./helpers.ts";

test("rlm_query fans out N queries and surfaces all responses in order", async () => {
  const result = await rlmQuery.call({ queries: ["a", "b", "c"] }, makeCtx(makeTmpDir("x")));
  expect(result.kind).toBe("text");
  if (result.kind !== "text") throw new Error("unreachable");
  // Header + one line per query.
  const lines = result.text.split("\n");
  expect(lines[0]).toContain("[rlm: 3 queries");
  expect(lines[0]).toContain("(default-cheap)");
  expect(lines[1]).toContain("[1/3]");
  expect(lines[1]).toContain("[mock response for: a]");
  expect(lines[2]).toContain("[2/3]");
  expect(lines[2]).toContain("[mock response for: b]");
  expect(lines[3]).toContain("[3/3]");
  expect(lines[3]).toContain("[mock response for: c]");
});

test("rlm_query honours model override in the header", async () => {
  const result = await rlmQuery.call(
    { queries: ["only one"], model: "deepseek-v4-flash" },
    makeCtx(makeTmpDir("x")),
  );
  if (result.kind !== "text") throw new Error("unreachable");
  expect(result.text).toContain("model=deepseek-v4-flash");
  expect(result.text).toContain("[mock response for: only one]");
});

test("rlm_query schema rejects more than 16 queries", () => {
  const queries = Array.from({ length: 17 }, (_, i) => `q${i}`);
  const parsed = rlmQuery.inputSchema.safeParse({ queries });
  expect(parsed.success).toBe(false);
});

test("rlm_query schema accepts exactly 16 queries (boundary)", async () => {
  const queries = Array.from({ length: 16 }, (_, i) => `q${i}`);
  const result = await rlmQuery.call({ queries }, makeCtx(makeTmpDir("x")));
  if (result.kind !== "text") throw new Error("unreachable");
  expect(result.text).toContain("[rlm: 16 queries");
  expect(result.text).toContain("[16/16]");
});
