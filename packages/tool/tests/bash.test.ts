import { afterEach, beforeEach, expect, test } from "bun:test";
import bash from "../src/tools/bash.ts";
import { cleanupTmpDir, makeCtx, makeTmpDir } from "./helpers.ts";

let cwd: string;

beforeEach(() => {
  cwd = makeTmpDir("openseek-bash-");
});

afterEach(() => {
  cleanupTmpDir(cwd);
});

test("bash echoes stdout with exit 0", async () => {
  const result = await bash.call({ command: "echo hello-bash" }, makeCtx(cwd));
  expect(result.kind).toBe("text");
  if (result.kind !== "text") throw new Error("unreachable");
  expect(result.text).toContain("# exit 0");
  expect(result.text).toContain("hello-bash");
});

test("bash captures non-zero exit code without erroring", async () => {
  const result = await bash.call({ command: "exit 7" }, makeCtx(cwd));
  expect(result.kind).toBe("text");
  if (result.kind !== "text") throw new Error("unreachable");
  expect(result.text).toContain("# exit 7");
});

test("bash captures stderr separately", async () => {
  const result = await bash.call(
    { command: "echo on-stdout && echo on-stderr 1>&2" },
    makeCtx(cwd),
  );
  expect(result.kind).toBe("text");
  if (result.kind !== "text") throw new Error("unreachable");
  expect(result.text).toContain("## stdout");
  expect(result.text).toContain("on-stdout");
  expect(result.text).toContain("## stderr");
  expect(result.text).toContain("on-stderr");
});

test("bash respects timeoutMs", async () => {
  const result = await bash.call(
    { command: "sleep 5", timeoutMs: 100 },
    makeCtx(cwd),
  );
  expect(result.kind).toBe("error");
  if (result.kind !== "error") throw new Error("unreachable");
  expect(result.message).toContain("timed out");
});

test("bash runs in ctx.cwd", async () => {
  await Bun.write(`${cwd}/marker.txt`, "x");
  const result = await bash.call({ command: "ls marker.txt" }, makeCtx(cwd));
  expect(result.kind).toBe("text");
  if (result.kind !== "text") throw new Error("unreachable");
  expect(result.text).toContain("marker.txt");
  expect(result.text).toContain("# exit 0");
});
