import { afterEach, beforeEach, expect, test } from "bun:test";
import { join } from "node:path";
import grep from "../src/tools/grep.ts";
import { cleanupTmpDir, makeCtx, makeTmpDir } from "./helpers.ts";

let cwd: string;

beforeEach(async () => {
  cwd = makeTmpDir("openseek-grep-");
  await Bun.write(join(cwd, "a.ts"), "const TODO = 1;\nconst keep = 2;\n");
  await Bun.write(join(cwd, "nested/b.ts"), "// TODO: refactor\nexport const X = 3;\n");
  await Bun.write(join(cwd, "nested/c.txt"), "todo lowercase here\n");
});

afterEach(() => {
  cleanupTmpDir(cwd);
});

test("grep finds all matches across files", async () => {
  const result = await grep.call({ pattern: "TODO" }, makeCtx(cwd));
  expect(result.kind).toBe("text");
  if (result.kind !== "text") throw new Error("unreachable");
  expect(result.text).toContain("a.ts:1:");
  expect(result.text).toContain("nested/b.ts:1:");
  // case-sensitive default — lowercase todo should NOT match
  expect(result.text).not.toContain("nested/c.txt");
});

test("grep --glob filter narrows to extension", async () => {
  const result = await grep.call({ pattern: "TODO", glob: "*.ts" }, makeCtx(cwd));
  expect(result.kind).toBe("text");
  if (result.kind !== "text") throw new Error("unreachable");
  expect(result.text).toContain(".ts:");
  expect(result.text).not.toContain(".txt:");
});

test("grep caseInsensitive picks up lowercase matches", async () => {
  const result = await grep.call(
    { pattern: "TODO", caseInsensitive: true },
    makeCtx(cwd),
  );
  expect(result.kind).toBe("text");
  if (result.kind !== "text") throw new Error("unreachable");
  expect(result.text).toContain("c.txt:1:todo lowercase here");
});

test("grep returns no-match message when nothing matches", async () => {
  const result = await grep.call({ pattern: "ZZZNOMATCHZZZ" }, makeCtx(cwd));
  expect(result.kind).toBe("text");
  if (result.kind !== "text") throw new Error("unreachable");
  expect(result.text).toContain("(no matches");
});

test("grep rejects path escaping cwd", async () => {
  await expect(
    grep.call({ pattern: "anything", path: "../escape" }, makeCtx(cwd)),
  ).rejects.toThrow(/escapes workspace/);
});
