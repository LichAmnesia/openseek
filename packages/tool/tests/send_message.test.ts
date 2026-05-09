import { afterEach, beforeEach, expect, test } from "bun:test";
import sendMessage from "../src/tools/send_message.ts";
import {
  openTaskStore,
  setDefaultTaskStore,
  type TaskStore,
} from "../src/sqlite-store.ts";
import { makeCtx, makeTmpDir } from "./helpers.ts";

let store: TaskStore;

beforeEach(() => {
  store = openTaskStore(":memory:");
  setDefaultTaskStore(store);
});

afterEach(() => {
  setDefaultTaskStore(null);
});

test("send_message persists into the messages table", async () => {
  const result = await sendMessage.call(
    { toAgent: "researcher", message: "please dig into the failing migration" },
    makeCtx(makeTmpDir("sm-")),
  );
  expect(result.kind).toBe("text");
  if (result.kind !== "text") throw new Error("unreachable");
  expect(result.text).toContain("researcher");
  expect(result.text).toContain("please dig");

  const inbox = store.listMessages({ toAgent: "researcher" });
  expect(inbox.length).toBe(1);
  expect(inbox[0]?.body).toBe("please dig into the failing migration");
});

test("send_message records threadId and fromAgent", async () => {
  await sendMessage.call(
    {
      toAgent: "x",
      message: "hi",
      threadId: "thread-42",
      fromAgent: "orchestrator",
    },
    makeCtx(makeTmpDir("sm-")),
  );
  const rows = store.listMessages({ threadId: "thread-42" });
  expect(rows.length).toBe(1);
  expect(rows[0]?.fromAgent).toBe("orchestrator");
});

test("send_message truncates long messages in the summary line only", async () => {
  const long = "x".repeat(500);
  const result = await sendMessage.call(
    { toAgent: "r", message: long },
    makeCtx(makeTmpDir("sm-")),
  );
  if (result.kind !== "text") throw new Error("unreachable");
  const summary = result.text.split("\n")[1] ?? "";
  expect(summary.length).toBeLessThanOrEqual(121);
  expect(summary.endsWith("…")).toBe(true);
  // full body still in db
  const rows = store.listMessages({ toAgent: "r" });
  expect(rows[0]?.body.length).toBe(500);
});
