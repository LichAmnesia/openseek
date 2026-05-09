import { afterEach, beforeEach, expect, test } from "bun:test";
import { openTaskStore, setDefaultTaskStore, type TaskStore } from "../src/sqlite-store.ts";
import taskGet from "../src/tools/task_get.ts";
import { cleanupTmpDir, makeCtx, makeTmpDir } from "./helpers.ts";

let cwd: string;
let store: TaskStore;

beforeEach(() => {
  cwd = makeTmpDir("openseek-task-get-");
  store = openTaskStore(":memory:");
  setDefaultTaskStore(store);
});

afterEach(() => {
  setDefaultTaskStore(null);
  cleanupTmpDir(cwd);
});

test("task_get returns error for unknown id", async () => {
  const result = await taskGet.call({ id: "no-such-id" }, makeCtx(cwd));
  expect(result.kind).toBe("error");
  if (result.kind !== "error") throw new Error("unreachable");
  expect(result.message).toContain("task not found");
});

test("task_get prints fields including meta", async () => {
  store.insertTask({
    id: "t-x",
    prompt: "hello",
    status: "running",
    meta: { foo: "bar" },
  });
  store.updateTask("t-x", { output: "partial output" });
  const result = await taskGet.call({ id: "t-x" }, makeCtx(cwd));
  expect(result.kind).toBe("text");
  if (result.kind !== "text") throw new Error("unreachable");
  expect(result.text).toContain("running");
  expect(result.text).toContain("partial output");
  expect(result.text).toContain("foo");
});
