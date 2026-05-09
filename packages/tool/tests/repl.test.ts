import { afterEach, beforeEach, expect, test } from "bun:test";
import repl from "../src/tools/repl.ts";
import { cleanupTmpDir, makeCtx, makeTmpDir } from "./helpers.ts";

let cwd: string;

beforeEach(() => {
  cwd = makeTmpDir("openseek-repl-");
});

afterEach(() => {
  cleanupTmpDir(cwd);
});

test("repl runs a simple js snippet via bun -e", async () => {
  const result = await repl.call(
    { language: "js", code: "console.log(1 + 2)" },
    makeCtx(cwd),
  );
  expect(result.kind).toBe("text");
  if (result.kind !== "text") throw new Error("unreachable");
  expect(result.text).toContain("exit=0");
  expect(result.text).toContain("3");
});

test("repl surfaces stderr on bad code", async () => {
  const result = await repl.call(
    { language: "js", code: "throw new Error('boom from test')" },
    makeCtx(cwd),
  );
  expect(result.kind).toBe("text");
  if (result.kind !== "text") throw new Error("unreachable");
  // Bun returns non-zero exit on uncaught throw
  expect(result.text).not.toContain("exit=0");
  expect(result.text.toLowerCase()).toContain("boom from test");
});

test("repl deny-in-plan permission", () => {
  expect(repl.permission).toBe("deny-in-plan");
});
