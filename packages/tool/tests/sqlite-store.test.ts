import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, expect, test } from "bun:test";
import { openTaskStore, type TaskStore } from "../src/sqlite-store.ts";

let store: TaskStore;

beforeEach(() => {
  store = openTaskStore(":memory:");
});

afterEach(() => {
  store.close();
});

test("insertTask + getTask round-trip", () => {
  const row = store.insertTask({ id: "t-1", prompt: "hello", meta: { name: "x" } });
  expect(row.id).toBe("t-1");
  expect(row.status).toBe("queued");
  const fetched = store.getTask("t-1");
  expect(fetched).not.toBeNull();
  expect(fetched?.prompt).toBe("hello");
  expect(fetched?.meta.name).toBe("x");
});

test("getTask returns null for unknown id", () => {
  expect(store.getTask("ghost")).toBeNull();
});

test("updateTask merges meta and updates timestamps", async () => {
  store.insertTask({ id: "t-1", prompt: "p", meta: { foo: "old" } });
  const before = store.getTask("t-1")!;
  await new Promise((r) => setTimeout(r, 5));
  const after = store.updateTask("t-1", { status: "running", meta: { bar: "new" } });
  expect(after?.status).toBe("running");
  expect(after?.meta.foo).toBe("old");
  expect(after?.meta.bar).toBe("new");
  expect(after?.updatedAt).toBeGreaterThan(before.updatedAt);
});

test("stopTask flips status and records reason", () => {
  store.insertTask({ id: "t-1", prompt: "p" });
  const stopped = store.stopTask("t-1", "user");
  expect(stopped?.status).toBe("stopped");
  expect(stopped?.meta.stopReason).toBe("user");
});

test("listTasks filters by status and respects limit", () => {
  store.insertTask({ id: "a", prompt: "x", status: "queued" });
  store.insertTask({ id: "b", prompt: "y", status: "running" });
  store.insertTask({ id: "c", prompt: "z", status: "running" });
  const running = store.listTasks({ status: "running" });
  expect(running.length).toBe(2);
  const limited = store.listTasks({ limit: 1 });
  expect(limited.length).toBe(1);
});

test("deleteTask removes row", () => {
  store.insertTask({ id: "t-1", prompt: "p" });
  expect(store.deleteTask("t-1")).toBe(true);
  expect(store.getTask("t-1")).toBeNull();
  expect(store.deleteTask("t-1")).toBe(false);
});

test("team CRUD", () => {
  store.insertTeam({ id: "team-1", name: "alpha", members: ["a", "b"] });
  expect(store.getTeam("team-1")?.members).toEqual(["a", "b"]);
  expect(store.listTeams().length).toBe(1);
  expect(store.deleteTeam("team-1")).toBe(true);
  expect(store.getTeam("team-1")).toBeNull();
});

test("cron CRUD", () => {
  store.insertCron({ id: "c-1", cron: "0 * * * *", taskId: "t-1", nextRun: 1234 });
  const all = store.listCrons();
  expect(all.length).toBe(1);
  expect(all[0]?.cron).toBe("0 * * * *");
  expect(all[0]?.nextRun).toBe(1234);
  expect(store.deleteCron("c-1")).toBe(true);
  expect(store.listCrons().length).toBe(0);
});

test("concurrent inserts preserve all rows", async () => {
  await Promise.all(
    Array.from({ length: 20 }, (_, i) =>
      Promise.resolve(store.insertTask({ id: `t-${i}`, prompt: `p${i}` })),
    ),
  );
  expect(store.listTasks({ limit: 100 }).length).toBe(20);
});

test("messages CRUD: insert, list, mark read", () => {
  const a = store.insertMessage({
    id: "m-1",
    toAgent: "researcher",
    fromAgent: "orchestrator",
    threadId: "t-1",
    body: "hello",
  });
  expect(a.readAt).toBeNull();
  store.insertMessage({ id: "m-2", toAgent: "other", body: "x" });
  store.insertMessage({ id: "m-3", toAgent: "researcher", body: "y", threadId: "t-1" });

  const inbox = store.listMessages({ toAgent: "researcher" });
  expect(inbox.length).toBe(2);
  const thread = store.listMessages({ threadId: "t-1" });
  expect(thread.length).toBe(2);
  const unread = store.listMessages({ toAgent: "researcher", unreadOnly: true });
  expect(unread.length).toBe(2);

  const marked = store.markMessageRead("m-1");
  expect(marked?.readAt).toBeGreaterThan(0);
  const stillUnread = store.listMessages({ toAgent: "researcher", unreadOnly: true });
  expect(stillUnread.length).toBe(1);
  expect(stillUnread[0]?.id).toBe("m-3");
});

test("data persists across close + reopen on the same file", () => {
  const dir = mkdtempSync(join(tmpdir(), "openseek-sqlite-"));
  const path = join(dir, "tasks.sqlite");
  try {
    const a = openTaskStore(path);
    a.insertTask({ id: "t-persist", prompt: "survives reboot" });
    a.insertTeam({ id: "team-persist", name: "p", members: ["x"] });
    a.insertCron({ id: "cron-persist", cron: "@daily", taskId: "t-persist", nextRun: 999 });
    a.close();

    const b = openTaskStore(path);
    expect(b.getTask("t-persist")?.prompt).toBe("survives reboot");
    expect(b.getTeam("team-persist")?.members).toEqual(["x"]);
    expect(b.listCrons().length).toBe(1);
    b.close();
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
