import { afterEach, beforeEach, expect, test } from "bun:test";
import { openTaskStore, setDefaultTaskStore, type TaskStore } from "../src/sqlite-store.ts";
import taskCreate from "../src/tools/task_create.ts";
import taskGet from "../src/tools/task_get.ts";
import { cleanupTmpDir, makeCtx, makeTmpDir } from "./helpers.ts";

let cwd: string;
let store: TaskStore;

beforeEach(() => {
  cwd = makeTmpDir("openseek-task-create-");
  store = openTaskStore(":memory:");
  setDefaultTaskStore(store);
});

afterEach(() => {
  setDefaultTaskStore(null);
  cleanupTmpDir(cwd);
});

test("task_create stores entry in sqlite store and returns id", async () => {
  const result = await taskCreate.call(
    { prompt: "investigate flaky test", name: "flaky-bot" },
    makeCtx(cwd),
  );
  expect(result.kind).toBe("text");
  if (result.kind !== "text") throw new Error("unreachable");
  expect(result.text).toContain("[task created");
  const all = store.listTasks();
  expect(all.length).toBe(1);
  const entry = all[0];
  if (!entry) throw new Error("expected one task entry");
  expect(entry.prompt).toBe("investigate flaky test");
  expect(entry.status).toBe("queued");
  expect(entry.meta.name).toBe("flaky-bot");
});

test("task_create round-trips through task_get", async () => {
  const create = await taskCreate.call({ prompt: "round-trip" }, makeCtx(cwd));
  if (create.kind !== "text") throw new Error("unreachable");
  const id = create.text.match(/id=(\S+?)\s/)?.[1];
  expect(id).toBeDefined();
  const got = await taskGet.call({ id: id! }, makeCtx(cwd));
  expect(got.kind).toBe("text");
  if (got.kind !== "text") throw new Error("unreachable");
  expect(got.text).toContain(id!);
  expect(got.text).toContain("queued");
  expect(got.text).toContain("round-trip");
});

test("task_create accepts free-form metadata", async () => {
  await taskCreate.call(
    { prompt: "with meta", meta: { project: "openseek", priority: "high" } },
    makeCtx(cwd),
  );
  const entry = store.listTasks()[0];
  if (!entry) throw new Error("expected one task entry");
  expect(entry.meta.project).toBe("openseek");
  expect(entry.meta.priority).toBe("high");
});
