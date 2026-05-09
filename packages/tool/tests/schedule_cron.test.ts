import { afterEach, beforeEach, expect, test } from "bun:test";
import { openTaskStore, setDefaultTaskStore, type TaskStore } from "../src/sqlite-store.ts";
import scheduleCron from "../src/tools/schedule_cron.ts";
import { makeCtx, makeTmpDir } from "./helpers.ts";

let store: TaskStore;

beforeEach(() => {
  store = openTaskStore(":memory:");
  setDefaultTaskStore(store);
});

afterEach(() => {
  setDefaultTaskStore(null);
});

test("schedule_cron records binding for an existing task", async () => {
  store.insertTask({ id: "t-1", prompt: "nightly eval", status: "queued" });
  const result = await scheduleCron.call(
    { cron: "0 3 * * *", taskId: "t-1" },
    makeCtx(makeTmpDir("x")),
  );
  expect(result.kind).toBe("text");
  const crons = store.listCrons();
  expect(crons.length).toBe(1);
  const entry = crons[0];
  if (!entry) throw new Error("expected one cron entry");
  expect(entry.cron).toBe("0 3 * * *");
  expect(entry.taskId).toBe("t-1");
  expect(entry.nextRun).toBeGreaterThan(Date.now());
});

test("schedule_cron rejects unknown taskId", async () => {
  const result = await scheduleCron.call(
    { cron: "0 * * * *", taskId: "nope" },
    makeCtx(makeTmpDir("x")),
  );
  expect(result.kind).toBe("error");
});

test("schedule_cron rejects invalid cron expression", async () => {
  store.insertTask({ id: "t-1", prompt: "x" });
  const result = await scheduleCron.call(
    { cron: "not-a-cron", taskId: "t-1" },
    makeCtx(makeTmpDir("x")),
  );
  expect(result.kind).toBe("error");
  if (result.kind !== "error") throw new Error("unreachable");
  expect(result.message).toContain("invalid cron");
});

test("schedule_cron accepts @hourly alias", async () => {
  store.insertTask({ id: "t-h", prompt: "x" });
  const result = await scheduleCron.call(
    { cron: "@hourly", taskId: "t-h" },
    makeCtx(makeTmpDir("x")),
  );
  expect(result.kind).toBe("text");
  expect(store.listCrons().length).toBe(1);
});
