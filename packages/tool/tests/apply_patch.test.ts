import { afterEach, beforeEach, expect, test } from "bun:test";
import { join } from "node:path";
import applyPatch from "../src/tools/apply_patch.ts";
import { cleanupTmpDir, makeCtx, makeTmpDir } from "./helpers.ts";

let cwd: string;

beforeEach(() => {
  cwd = makeTmpDir("openseek-apply-patch-");
});

afterEach(() => {
  cleanupTmpDir(cwd);
});

test("apply_patch applies a single hunk", async () => {
  await Bun.write(join(cwd, "a.txt"), "alpha\nbeta\ngamma\n");
  const patch = [
    "--- a/a.txt",
    "+++ b/a.txt",
    "@@ -1,3 +1,3 @@",
    " alpha",
    "-beta",
    "+BETA",
    " gamma",
    "",
  ].join("\n");
  const result = await applyPatch.call({ patch }, makeCtx(cwd));
  expect(result.kind).toBe("diff");
  if (result.kind !== "diff") throw new Error("unreachable");
  expect(result.path).toBe("a.txt");
  const after = await Bun.file(join(cwd, "a.txt")).text();
  expect(after).toBe("alpha\nBETA\ngamma\n");
});

test("apply_patch applies multiple hunks in one file", async () => {
  const original = ["one", "two", "three", "four", "five", "six"].join("\n");
  await Bun.write(join(cwd, "b.txt"), original);
  const patch = [
    "--- a/b.txt",
    "+++ b/b.txt",
    "@@ -1,2 +1,2 @@",
    "-one",
    "+ONE",
    " two",
    "@@ -5,2 +5,2 @@",
    " five",
    "-six",
    "+SIX",
    "",
  ].join("\n");
  const result = await applyPatch.call({ patch }, makeCtx(cwd));
  if (result.kind === "error") {
    throw new Error(`unexpected error: ${result.message}`);
  }
  expect(result.kind).toBe("diff");
  const after = await Bun.file(join(cwd, "b.txt")).text();
  expect(after).toBe(["ONE", "two", "three", "four", "five", "SIX"].join("\n"));
});

test("apply_patch errors and does not write on context mismatch", async () => {
  await Bun.write(join(cwd, "c.txt"), "alpha\nbeta\ngamma\n");
  const patch = [
    "--- a/c.txt",
    "+++ b/c.txt",
    "@@ -1,3 +1,3 @@",
    " alpha",
    "-WRONG",
    "+CORRECT",
    " gamma",
    "",
  ].join("\n");
  const result = await applyPatch.call({ patch }, makeCtx(cwd));
  expect(result.kind).toBe("error");
  if (result.kind !== "error") throw new Error("unreachable");
  expect(result.message).toContain("hunk failure");
  const after = await Bun.file(join(cwd, "c.txt")).text();
  expect(after).toBe("alpha\nbeta\ngamma\n");
});

test("apply_patch errors on malformed patch text", async () => {
  const result = await applyPatch.call(
    { patch: "this is not a diff at all" },
    makeCtx(cwd),
  );
  expect(result.kind).toBe("error");
  if (result.kind !== "error") throw new Error("unreachable");
  expect(result.message).toContain("patch parse error");
});

test("apply_patch refuses missing target file", async () => {
  const patch = [
    "--- a/missing.txt",
    "+++ b/missing.txt",
    "@@ -1,1 +1,1 @@",
    "-x",
    "+y",
    "",
  ].join("\n");
  const result = await applyPatch.call({ patch }, makeCtx(cwd));
  expect(result.kind).toBe("error");
  if (result.kind !== "error") throw new Error("unreachable");
  expect(result.message).toContain("file not found");
});
