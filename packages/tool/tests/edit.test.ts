import { afterEach, beforeEach, expect, test } from "bun:test";
import { join } from "node:path";
import edit from "../src/tools/edit.ts";
import { cleanupTmpDir, makeCtx, makeTmpDir } from "./helpers.ts";

let cwd: string;

beforeEach(() => {
  cwd = makeTmpDir("openseek-edit-");
});

afterEach(() => {
  cleanupTmpDir(cwd);
});

test("edit replaces a unique substring and returns diff", async () => {
  await Bun.write(join(cwd, "a.txt"), "hello world\nbye world\n");
  const result = await edit.call(
    { path: "a.txt", old_string: "hello world", new_string: "hi world" },
    makeCtx(cwd),
  );
  expect(result.kind).toBe("diff");
  if (result.kind !== "diff") throw new Error("unreachable");
  expect(result.before).toBe("hello world\nbye world\n");
  expect(result.after).toBe("hi world\nbye world\n");
  expect(await Bun.file(join(cwd, "a.txt")).text()).toBe("hi world\nbye world\n");
});

test("edit errors when old_string is not unique", async () => {
  await Bun.write(join(cwd, "a.txt"), "foo\nfoo\nfoo\n");
  const result = await edit.call(
    { path: "a.txt", old_string: "foo", new_string: "bar" },
    makeCtx(cwd),
  );
  expect(result.kind).toBe("error");
  if (result.kind !== "error") throw new Error("unreachable");
  expect(result.message).toContain("occurs 3 times");
});

test("edit errors when old_string is missing", async () => {
  await Bun.write(join(cwd, "a.txt"), "abc\n");
  const result = await edit.call(
    { path: "a.txt", old_string: "xyz", new_string: "qqq" },
    makeCtx(cwd),
  );
  expect(result.kind).toBe("error");
  if (result.kind !== "error") throw new Error("unreachable");
  expect(result.message).toContain("not found");
});

test("edit errors when file missing", async () => {
  const result = await edit.call(
    { path: "missing.txt", old_string: "a", new_string: "b" },
    makeCtx(cwd),
  );
  expect(result.kind).toBe("error");
  if (result.kind !== "error") throw new Error("unreachable");
  expect(result.message).toContain("file not found");
});

test("edit rejects identical old/new", async () => {
  await Bun.write(join(cwd, "a.txt"), "same\n");
  const result = await edit.call(
    { path: "a.txt", old_string: "same", new_string: "same" },
    makeCtx(cwd),
  );
  expect(result.kind).toBe("error");
  if (result.kind !== "error") throw new Error("unreachable");
  expect(result.message).toContain("identical");
});
