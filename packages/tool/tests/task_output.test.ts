import { afterEach, beforeEach, expect, test } from "bun:test";
import { openTaskStore, setDefaultTaskStore, type TaskStore } from "../src/sqlite-store.ts";
import taskOutput from "../src/tools/task_output.ts";
import { cleanupTmpDir, makeCtx, makeTmpDir } from "./helpers.ts";

let cwd: string;
let store: TaskStore;

beforeEach(() => {
  cwd = makeTmpDir("openseek-task-output-");
  store = openTaskStore(":memory:");
  setDefaultTaskStore(store);
});

afterEach(() => {
  setDefaultTaskStore(null);
  cleanupTmpDir(cwd);
});

test("task_output returns error for unknown id", async () => {
  const result = await taskOutput.call({ id: "missing" }, makeCtx(cwd));
  expect(result.kind).toBe("error");
});

test("task_output returns not-yet-implemented marker for tasks with no output", async () => {
  store.insertTask({ id: "t-1", prompt: "x", status: "running" });
  const result = await taskOutput.call({ id: "t-1" }, makeCtx(cwd));
  expect(result.kind).toBe("text");
  if (result.kind !== "text") throw new Error("unreachable");
  expect(result.text).toContain("not yet implemented");
});

test("task_output returns the stored output when set", async () => {
  store.insertTask({ id: "t-2", prompt: "x", status: "done", output: "hello world" });
  const result = await taskOutput.call({ id: "t-2" }, makeCtx(cwd));
  if (result.kind !== "text") throw new Error("unreachable");
  expect(result.text).toContain("hello world");
});
