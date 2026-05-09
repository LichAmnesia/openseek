import { afterEach, beforeEach, expect, test } from "bun:test";
import { join } from "node:path";
import write from "../src/tools/write.ts";
import { cleanupTmpDir, makeCtx, makeTmpDir } from "./helpers.ts";

let cwd: string;

beforeEach(() => {
  cwd = makeTmpDir("openseek-write-");
});

afterEach(() => {
  cleanupTmpDir(cwd);
});

test("write creates a new file and returns a diff", async () => {
  const result = await write.call(
    { path: "out/new.txt", content: "hello\n" },
    makeCtx(cwd),
  );
  expect(result.kind).toBe("diff");
  if (result.kind !== "diff") throw new Error("unreachable");
  expect(result.before).toBe("");
  expect(result.after).toBe("hello\n");
  const onDisk = await Bun.file(join(cwd, "out/new.txt")).text();
  expect(onDisk).toBe("hello\n");
});

test("write refuses to overwrite without force", async () => {
  await Bun.write(join(cwd, "exists.txt"), "old");
  const result = await write.call({ path: "exists.txt", content: "new" }, makeCtx(cwd));
  expect(result.kind).toBe("error");
  if (result.kind !== "error") throw new Error("unreachable");
  expect(result.message).toContain("refusing to overwrite");
  // file untouched
  expect(await Bun.file(join(cwd, "exists.txt")).text()).toBe("old");
});

test("write with force replaces file content", async () => {
  await Bun.write(join(cwd, "exists.txt"), "old");
  const result = await write.call(
    { path: "exists.txt", content: "new", force: true },
    makeCtx(cwd),
  );
  expect(result.kind).toBe("diff");
  if (result.kind !== "diff") throw new Error("unreachable");
  expect(result.before).toBe("old");
  expect(result.after).toBe("new");
});

test("write rejects paths escaping cwd", async () => {
  await expect(
    write.call({ path: "../escape.txt", content: "x" }, makeCtx(cwd)),
  ).rejects.toThrow(/escapes workspace/);
});
