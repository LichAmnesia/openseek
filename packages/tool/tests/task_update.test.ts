import { afterEach, beforeEach, expect, test } from "bun:test";
import { openTaskStore, setDefaultTaskStore, type TaskStore } from "../src/sqlite-store.ts";
import taskUpdate from "../src/tools/task_update.ts";
import { makeCtx, makeTmpDir } from "./helpers.ts";

let store: TaskStore;

beforeEach(() => {
  store = openTaskStore(":memory:");
  setDefaultTaskStore(store);
});

afterEach(() => {
  setDefaultTaskStore(null);
});

test("task_update merges fields without overwriting unset", async () => {
  store.insertTask({ id: "t-1", prompt: "x", status: "queued", meta: { foo: "old" } });
  await taskUpdate.call(
    { id: "t-1", status: "running", meta: { bar: "new" } },
    makeCtx(makeTmpDir("x")),
  );
  const entry = store.getTask("t-1");
  if (!entry) throw new Error("expected entry");
  expect(entry.status).toBe("running");
  expect(entry.meta.foo).toBe("old"); // preserved
  expect(entry.meta.bar).toBe("new"); // merged
});

test("task_update writes output snapshot", async () => {
  store.insertTask({ id: "t-2", prompt: "x", status: "running" });
  await taskUpdate.call({ id: "t-2", output: "stdout content" }, makeCtx(makeTmpDir("x")));
  expect(store.getTask("t-2")?.output).toBe("stdout content");
});

test("task_update returns error for unknown id", async () => {
  const result = await taskUpdate.call({ id: "ghost", status: "done" }, makeCtx(makeTmpDir("x")));
  expect(result.kind).toBe("error");
});
