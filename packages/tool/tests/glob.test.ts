import { afterEach, beforeEach, expect, test } from "bun:test";
import { join } from "node:path";
import glob from "../src/tools/glob.ts";
import { cleanupTmpDir, makeCtx, makeTmpDir } from "./helpers.ts";

let cwd: string;

beforeEach(async () => {
  cwd = makeTmpDir("openseek-glob-");
  await Bun.write(join(cwd, "a.ts"), "");
  await Bun.write(join(cwd, "b.ts"), "");
  await Bun.write(join(cwd, "nested/c.ts"), "");
  await Bun.write(join(cwd, "nested/d.txt"), "");
  await Bun.write(join(cwd, "README.md"), "");
});

afterEach(() => {
  cleanupTmpDir(cwd);
});

test("glob matches all .ts files recursively", async () => {
  const result = await glob.call({ pattern: "**/*.ts" }, makeCtx(cwd));
  expect(result.kind).toBe("text");
  if (result.kind !== "text") throw new Error("unreachable");
  const matches = result.text.split("\n");
  expect(matches).toContain("a.ts");
  expect(matches).toContain("b.ts");
  expect(matches).toContain("nested/c.ts");
  expect(matches).not.toContain("nested/d.txt");
  // sorted
  const sorted = [...matches].sort();
  expect(matches).toEqual(sorted);
});

test("glob returns no-match message when nothing matches", async () => {
  const result = await glob.call({ pattern: "**/*.rs" }, makeCtx(cwd));
  expect(result.kind).toBe("text");
  if (result.kind !== "text") throw new Error("unreachable");
  expect(result.text).toContain("(no matches for **/*.rs)");
});

test("glob rejects absolute pattern", async () => {
  await expect(glob.call({ pattern: "/etc/*" }, makeCtx(cwd))).rejects.toThrow(
    /absolute path not allowed/,
  );
});

test("glob respects limit", async () => {
  const result = await glob.call({ pattern: "**/*", limit: 2 }, makeCtx(cwd));
  expect(result.kind).toBe("text");
  if (result.kind !== "text") throw new Error("unreachable");
  const lines = result.text.split("\n");
  expect(lines.length).toBe(2);
});
