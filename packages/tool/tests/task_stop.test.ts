import { afterEach, beforeEach, expect, test } from "bun:test";
import { openTaskStore, setDefaultTaskStore, type TaskStore } from "../src/sqlite-store.ts";
import taskStop from "../src/tools/task_stop.ts";
import { makeCtx, makeTmpDir } from "./helpers.ts";

let store: TaskStore;

beforeEach(() => {
  store = openTaskStore(":memory:");
  setDefaultTaskStore(store);
});

afterEach(() => {
  setDefaultTaskStore(null);
});

test("task_stop flips status to stopped and records reason", async () => {
  store.insertTask({ id: "t-1", prompt: "x", status: "running" });
  const result = await taskStop.call(
    { id: "t-1", reason: "user cancelled" },
    makeCtx(makeTmpDir("x")),
  );
  expect(result.kind).toBe("text");
  const entry = store.getTask("t-1");
  if (!entry) throw new Error("expected entry");
  expect(entry.status).toBe("stopped");
  expect(entry.meta.stopReason).toBe("user cancelled");
});

test("task_stop returns error for unknown id", async () => {
  const result = await taskStop.call({ id: "ghost" }, makeCtx(makeTmpDir("x")));
  expect(result.kind).toBe("error");
  if (result.kind !== "error") throw new Error("unreachable");
  expect(result.message).toContain("task not found");
});
