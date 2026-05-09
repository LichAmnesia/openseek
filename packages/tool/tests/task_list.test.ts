import { afterEach, beforeEach, expect, test } from "bun:test";
import { openTaskStore, setDefaultTaskStore, type TaskStore } from "../src/sqlite-store.ts";
import taskList from "../src/tools/task_list.ts";
import { cleanupTmpDir, makeCtx, makeTmpDir } from "./helpers.ts";

let cwd: string;
let store: TaskStore;

beforeEach(() => {
  cwd = makeTmpDir("openseek-task-list-");
  store = openTaskStore(":memory:");
  setDefaultTaskStore(store);
});

afterEach(() => {
  setDefaultTaskStore(null);
  cleanupTmpDir(cwd);
});

test("task_list returns no-tasks marker on empty store", async () => {
  const result = await taskList.call({}, makeCtx(cwd));
  expect(result.kind).toBe("text");
  if (result.kind !== "text") throw new Error("unreachable");
  expect(result.text).toBe("no tasks");
});

test("task_list filters by status", async () => {
  store.insertTask({ id: "a", prompt: "queued one", status: "queued" });
  store.insertTask({ id: "b", prompt: "running one", status: "running" });
  const all = await taskList.call({}, makeCtx(cwd));
  if (all.kind !== "text") throw new Error("unreachable");
  expect(all.text).toContain("a");
  expect(all.text).toContain("b");

  const onlyRunning = await taskList.call({ status: "running" }, makeCtx(cwd));
  if (onlyRunning.kind !== "text") throw new Error("unreachable");
  expect(onlyRunning.text).toContain("b");
  expect(onlyRunning.text).not.toContain("queued one");
});

test("task_list respects limit", async () => {
  for (let i = 0; i < 5; i += 1) {
    store.insertTask({ id: `t-${i}`, prompt: `prompt ${i}`, status: "queued" });
  }
  const result = await taskList.call({ limit: 2 }, makeCtx(cwd));
  if (result.kind !== "text") throw new Error("unreachable");
  expect(result.text).toContain("2 task(s)");
});
