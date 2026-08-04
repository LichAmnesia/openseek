import { afterEach, beforeEach, expect, test } from "bun:test";
import { join } from "node:path";
import read from "../src/tools/read.ts";
import { cleanupTmpDir, makeCtx, makeTmpDir } from "./helpers.ts";

let cwd: string;

beforeEach(() => {
  cwd = makeTmpDir("openseek-read-");
});

afterEach(() => {
  cleanupTmpDir(cwd);
});

test("read returns numbered lines with header", async () => {
  await Bun.write(join(cwd, "a.txt"), "alpha\nbeta\ngamma\n");
  const result = await read.call({ path: "a.txt" }, makeCtx(cwd));
  expect(result.kind).toBe("text");
  if (result.kind !== "text") throw new Error("unreachable");
  expect(result.text).toContain("# a.txt — lines 1-4 of 4");
  expect(result.text).toContain("     1\talpha");
  expect(result.text).toContain("     3\tgamma");
});

test("read supports offset + limit paging", async () => {
  const lines = Array.from({ length: 50 }, (_, i) => `line-${i + 1}`).join("\n");
  await Bun.write(join(cwd, "long.txt"), lines);
  const result = await read.call({ path: "long.txt", offset: 10, limit: 5 }, makeCtx(cwd));
  expect(result.kind).toBe("text");
  if (result.kind !== "text") throw new Error("unreachable");
  expect(result.text).toContain("lines 11-15 of 50");
  expect(result.text).toContain("    11\tline-11");
  expect(result.text).toContain("    15\tline-15");
  expect(result.text).not.toContain("line-16");
});

test("read errors on missing file", async () => {
  const result = await read.call({ path: "nope.txt" }, makeCtx(cwd));
  expect(result.kind).toBe("error");
  if (result.kind !== "error") throw new Error("unreachable");
  expect(result.message).toContain("file not found");
});

// G8.7: read is a read-only tool — absolute / escaping paths are allowed
// (bash is unrestricted anyway, and one-shot runs reference task files by
// absolute path). Mutating tools keep the workspace fence — see write.test.ts.
test("read allows absolute path outside the workspace", async () => {
  const outside = makeTmpDir("openseek-read-outside-");
  try {
    await Bun.write(join(outside, "task.md"), "outside-secret\n");
    const result = await read.call({ path: join(outside, "task.md") }, makeCtx(cwd));
    expect(result.kind).toBe("text");
    if (result.kind !== "text") throw new Error("unreachable");
    expect(result.text).toContain("outside-secret");
    // Header shows the absolute path since it's not under cwd.
    expect(result.text).toContain(join(outside, "task.md"));
  } finally {
    cleanupTmpDir(outside);
  }
});

test("read allows relative path escaping cwd (missing file → clean error)", async () => {
  const result = await read.call({ path: "../no-such-escape-file.txt" }, makeCtx(cwd));
  expect(result.kind).toBe("error");
  if (result.kind !== "error") throw new Error("unreachable");
  expect(result.message).toContain("file not found");
});

test("read flattens .ipynb cells", async () => {
  const nb = {
    cells: [
      { cell_type: "markdown", source: ["# Title\n", "intro"] },
      { cell_type: "code", source: "print('hi')\n" },
    ],
  };
  await Bun.write(join(cwd, "nb.ipynb"), JSON.stringify(nb));
  const result = await read.call({ path: "nb.ipynb" }, makeCtx(cwd));
  expect(result.kind).toBe("text");
  if (result.kind !== "text") throw new Error("unreachable");
  expect(result.text).toContain("# cell[0] (markdown)");
  expect(result.text).toContain("# Title");
  expect(result.text).toContain("# cell[1] (code)");
  expect(result.text).toContain("print('hi')");
});
