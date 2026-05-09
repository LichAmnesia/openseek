import { test, expect, beforeEach } from "bun:test";
import { createApp } from "../src/app.ts";
import { openTaskStore, type TaskStore } from "@openseek/tool";

let store: TaskStore;
let app: ReturnType<typeof createApp>;
let counter = 0;

beforeEach(() => {
  store = openTaskStore(":memory:");
  counter = 0;
  app = createApp(
    { taskStore: store, corsOrigins: ["*"] },
    { taskStore: store, idGen: () => `th_t_${++counter}` },
  );
});

async function jsonReq(path: string, init?: RequestInit) {
  const res = await app.fetch(new Request(`http://localhost${path}`, init));
  return { res, body: await res.json().catch(() => null) };
}

test("/healthz returns 200 ok", async () => {
  const res = await app.fetch(new Request("http://localhost/healthz"));
  expect(res.status).toBe(200);
  const body = (await res.json()) as { ok: boolean };
  expect(body.ok).toBe(true);
});

test("POST /v1/threads creates a thread and returns id", async () => {
  const { res, body } = await jsonReq("/v1/threads", { method: "POST" });
  expect(res.status).toBe(201);
  const r = body as { threadId: string; createdAt: string };
  expect(r.threadId).toBe("th_t_1");
  expect(typeof r.createdAt).toBe("string");
});

test("GET /v1/threads/:id reads back the freshly created thread", async () => {
  await app.fetch(new Request("http://localhost/v1/threads", { method: "POST" }));
  const { res, body } = await jsonReq("/v1/threads/th_t_1");
  expect(res.status).toBe(200);
  const r = body as { id: string; messages: unknown[] };
  expect(r.id).toBe("th_t_1");
  expect(Array.isArray(r.messages)).toBe(true);
});

test("GET /v1/threads/:id 404 for unknown thread", async () => {
  const { res } = await jsonReq("/v1/threads/missing");
  expect(res.status).toBe(404);
});

test("DELETE /v1/threads/:id removes the thread", async () => {
  await app.fetch(new Request("http://localhost/v1/threads", { method: "POST" }));
  const del = await app.fetch(
    new Request("http://localhost/v1/threads/th_t_1", { method: "DELETE" }),
  );
  expect(del.status).toBe(200);
  const after = await app.fetch(new Request("http://localhost/v1/threads/th_t_1"));
  expect(after.status).toBe(404);
});

test("POST /v1/threads/:id/messages streams SSE events", async () => {
  await app.fetch(new Request("http://localhost/v1/threads", { method: "POST" }));
  const res = await app.fetch(
    new Request("http://localhost/v1/threads/th_t_1/messages", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text: "hello" }),
    }),
  );
  expect(res.status).toBe(200);
  expect(res.headers.get("Content-Type")).toContain("text/event-stream");
  const body = await res.text();
  expect(body).toContain("event: thread.id");
  expect(body).toContain("event: message.delta");
  expect(body).toContain("event: message.complete");
  expect(body).toContain("[DONE]");
});

test("POST /v1/threads/:id/messages 400 for empty body", async () => {
  await app.fetch(new Request("http://localhost/v1/threads", { method: "POST" }));
  const res = await app.fetch(
    new Request("http://localhost/v1/threads/th_t_1/messages", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({}),
    }),
  );
  expect(res.status).toBe(400);
});

test("GET /v1/usage default group_by=day returns shape", async () => {
  store.insertTask({
    id: "k-1",
    prompt: "x",
    status: "done",
    meta: { totalIn: "10", totalOut: "20", model: "deepseek-chat", provider: "mikan" },
  });
  const { res, body } = await jsonReq("/v1/usage");
  expect(res.status).toBe(200);
  const r = body as { groupBy: string; buckets: { totalIn: number; totalOut: number }[] };
  expect(r.groupBy).toBe("day");
  expect(r.buckets.length).toBeGreaterThanOrEqual(1);
  const first = r.buckets[0];
  if (!first) throw new Error("expected first bucket");
  expect(first.totalIn).toBe(10);
  expect(first.totalOut).toBe(20);
});

test("GET /v1/usage?group_by=model groups by meta.model", async () => {
  store.insertTask({
    id: "k-2",
    prompt: "x",
    meta: { totalIn: "5", totalOut: "1", model: "deepseek-chat" },
  });
  store.insertTask({
    id: "k-3",
    prompt: "y",
    meta: { totalIn: "8", totalOut: "2", model: "gpt-4o" },
  });
  const { res, body } = await jsonReq("/v1/usage?group_by=model");
  expect(res.status).toBe(200);
  const r = body as { buckets: { key: string }[] };
  const keys = r.buckets.map((b) => b.key).sort();
  expect(keys).toEqual(["deepseek-chat", "gpt-4o"]);
});

test("GET /v1/usage?group_by=junk returns 400", async () => {
  const res = await app.fetch(new Request("http://localhost/v1/usage?group_by=lol"));
  expect(res.status).toBe(400);
});

test("OPTIONS preflight returns 204 + CORS headers", async () => {
  const res = await app.fetch(
    new Request("http://localhost/v1/threads", {
      method: "OPTIONS",
      headers: { Origin: "https://example.com" },
    }),
  );
  expect(res.status).toBe(204);
  expect(res.headers.get("Access-Control-Allow-Origin")).toBe("*");
  expect(res.headers.get("Access-Control-Allow-Methods")).toContain("POST");
});

test("CORS allowlist honors specific origin", async () => {
  const local = createApp({ taskStore: store, corsOrigins: ["https://app.dev"] });
  const yes = await local.fetch(
    new Request("http://localhost/healthz", { headers: { Origin: "https://app.dev" } }),
  );
  expect(yes.headers.get("Access-Control-Allow-Origin")).toBe("https://app.dev");
  const no = await local.fetch(
    new Request("http://localhost/healthz", { headers: { Origin: "https://evil.dev" } }),
  );
  expect(no.headers.get("Access-Control-Allow-Origin")).toBeNull();
});

test("notFound returns 404 JSON", async () => {
  const res = await app.fetch(new Request("http://localhost/no-such-path"));
  expect(res.status).toBe(404);
});
