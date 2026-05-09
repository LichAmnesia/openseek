// Hono app factory for the headless HTTP/SSE server (G6.1).
//
// Routes:
//   POST   /v1/threads                   create thread
//   GET    /v1/threads/:id               read thread
//   DELETE /v1/threads/:id               drop thread
//   POST   /v1/threads/:id/messages      submit message → SSE stream
//   GET    /v1/usage?group_by=...        usage aggregation from sqlite
//   GET    /healthz                      liveness probe
//
// We intentionally keep all in-flight thread state in-memory (a small Map).
// Persistent usage history sits in the existing tool sqlite-store under the
// `task` namespace — `task_create` already writes there per turn so we just
// aggregate.

import { Hono } from "hono";
import { streamSSE } from "hono/streaming";
import {
  getDefaultTaskStore,
  type TaskStore,
} from "@openseek/tool";
import type {
  ServerConfig,
  ThreadRecord,
  UsageBucket,
  UsageGroupBy,
  UsageResponse,
} from "./types.ts";

const ALLOWED_GROUP_BY: UsageGroupBy[] = ["day", "model", "provider", "thread"];

export interface AppDeps {
  /** Override store for tests (defaults to the singleton sqlite store). */
  taskStore?: TaskStore;
  /** Inject id generator for deterministic tests. */
  idGen?: () => string;
}

export function createApp(cfg: ServerConfig = {}, deps: AppDeps = {}): Hono {
  const threads = new Map<string, ThreadRecord>();
  const taskStore = deps.taskStore ?? cfg.taskStore ?? getDefaultTaskStore();
  const corsOrigins = cfg.corsOrigins ?? ["*"];
  const idGen = deps.idGen ?? defaultThreadId;

  const app = new Hono();

  // ---- CORS preflight + headers --------------------------------------------
  app.use("*", async (c, next) => {
    const origin = c.req.header("Origin") ?? "";
    const allow = pickAllowed(origin, corsOrigins);
    if (allow) c.header("Access-Control-Allow-Origin", allow);
    c.header("Access-Control-Allow-Headers", "Content-Type, Authorization");
    c.header("Access-Control-Allow-Methods", "GET, POST, DELETE, OPTIONS");
    if (c.req.method === "OPTIONS") return c.body(null, 204);
    await next();
  });

  app.get("/healthz", (c) => c.json({ ok: true, ts: new Date().toISOString() }));

  app.post("/v1/threads", (c) => {
    const id = idGen();
    const record: ThreadRecord = {
      id,
      createdAt: new Date().toISOString(),
      messages: [],
      usage: { totalIn: 0, totalOut: 0, cacheCreation: 0, cacheRead: 0 },
    };
    threads.set(id, record);
    return c.json({ threadId: id, createdAt: record.createdAt }, 201);
  });

  app.get("/v1/threads/:id", (c) => {
    const t = threads.get(c.req.param("id"));
    if (!t) return c.json({ error: "thread not found" }, 404);
    return c.json(t);
  });

  app.delete("/v1/threads/:id", (c) => {
    const ok = threads.delete(c.req.param("id"));
    return c.json({ deleted: ok }, ok ? 200 : 404);
  });

  app.post("/v1/threads/:id/messages", async (c) => {
    const id = c.req.param("id");
    const t = threads.get(id);
    if (!t) return c.json({ error: "thread not found" }, 404);
    let body: unknown;
    try {
      body = await c.req.json();
    } catch {
      return c.json({ error: "invalid JSON body" }, 400);
    }
    const text = extractText(body);
    if (!text) return c.json({ error: "missing 'text' field" }, 400);
    t.messages.push({ role: "user", text, at: new Date().toISOString() });

    return streamSSE(c, async (s) => {
      // Emit a small canned stream. Real wiring to runSession is deferred to
      // the cli — keeping the server protocol-pure for v0.6 acceptance.
      await s.writeSSE({ event: "thread.id", data: id });
      await s.writeSSE({ event: "message.delta", data: `echo:${text}` });
      const reply = `ack:${text}`;
      t.messages.push({ role: "assistant", text: reply, at: new Date().toISOString() });
      await s.writeSSE({ event: "message.complete", data: reply });
      await s.writeSSE({ event: "done", data: "[DONE]" });
    });
  });

  app.get("/v1/usage", (c) => {
    const raw = c.req.query("group_by") ?? "day";
    if (!isUsageGroupBy(raw)) return c.json({ error: "invalid group_by" }, 400);
    const buckets = aggregateUsage(taskStore, raw);
    const out: UsageResponse = { groupBy: raw, buckets };
    return c.json(out);
  });

  app.notFound((c) => c.json({ error: "not found" }, 404));
  return app;
}

function defaultThreadId(): string {
  const rand = Math.random().toString(36).slice(2, 10);
  return `th_${Date.now().toString(36)}_${rand}`;
}

function extractText(body: unknown): string | null {
  if (typeof body !== "object" || body === null) return null;
  const rec = body as Record<string, unknown>;
  if (typeof rec.text === "string" && rec.text.trim().length > 0) return rec.text;
  return null;
}

function isUsageGroupBy(s: string): s is UsageGroupBy {
  return (ALLOWED_GROUP_BY as string[]).includes(s);
}

function pickAllowed(origin: string, allowed: string[]): string | null {
  if (allowed.includes("*")) return "*";
  if (origin && allowed.includes(origin)) return origin;
  return null;
}

function aggregateUsage(store: TaskStore, groupBy: UsageGroupBy): UsageBucket[] {
  const tasks = store.listTasks({ limit: 1000 });
  const map = new Map<string, UsageBucket>();
  for (const t of tasks) {
    const meta = t.meta;
    const tIn = numberFromMeta(meta.totalIn);
    const tOut = numberFromMeta(meta.totalOut);
    const key = bucketKey(t, groupBy);
    const cur = map.get(key) ?? { key, totalIn: 0, totalOut: 0, count: 0 };
    cur.totalIn += tIn;
    cur.totalOut += tOut;
    cur.count += 1;
    map.set(key, cur);
  }
  return [...map.values()].sort((a, b) => a.key.localeCompare(b.key));
}

function bucketKey(t: { meta: Record<string, string>; id: string; createdAt: number }, g: UsageGroupBy): string {
  if (g === "day") return new Date(t.createdAt).toISOString().slice(0, 10);
  if (g === "model") return t.meta.model ?? "unknown";
  if (g === "provider") return t.meta.provider ?? "unknown";
  return t.meta.threadId ?? t.id;
}

function numberFromMeta(v: string | undefined): number {
  if (!v) return 0;
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}
