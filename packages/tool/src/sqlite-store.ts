// SQLite-backed durable store for tasks / teams / crons (G3.6).
//
// Replaces the in-memory Maps in `state.ts`. Survives process restarts so
// that `task_create` followed by a server restart followed by `task_get`
// still round-trips. Uses Bun's built-in `bun:sqlite` driver — no extra deps.
//
// Default DB path: `~/.openseek/tasks.sqlite`. Tests pass `:memory:` to
// stay ephemeral. The `dbPath` is the only configuration knob.

import { Database } from "bun:sqlite";
import { mkdirSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join } from "node:path";

export type TaskStatus = "queued" | "running" | "stopped" | "done" | "error";

export interface TaskRow {
  id: string;
  prompt: string;
  status: TaskStatus;
  output: string;
  meta: Record<string, string>;
  createdAt: number;
  updatedAt: number;
}

export interface TeamRow {
  id: string;
  name: string;
  members: string[];
  createdAt: number;
}

export interface CronRow {
  id: string;
  cron: string;
  taskId: string;
  nextRun: number | null;
  createdAt: number;
}

export interface MessageRow {
  id: string;
  toAgent: string;
  fromAgent: string | null;
  threadId: string | null;
  body: string;
  createdAt: number;
  readAt: number | null;
}

export interface InsertTaskInput {
  id: string;
  prompt: string;
  status?: TaskStatus;
  output?: string;
  meta?: Record<string, string>;
}

export interface UpdateTaskInput {
  status?: TaskStatus;
  output?: string;
  meta?: Record<string, string>;
}

export interface InsertTeamInput {
  id: string;
  name: string;
  members: string[];
}

export interface InsertCronInput {
  id: string;
  cron: string;
  taskId: string;
  nextRun: number | null;
}

export interface InsertMessageInput {
  id: string;
  toAgent: string;
  fromAgent?: string | null;
  threadId?: string | null;
  body: string;
}

export interface ListMessagesFilter {
  toAgent?: string;
  threadId?: string;
  unreadOnly?: boolean;
  limit?: number;
}

export interface TaskStore {
  insertTask(input: InsertTaskInput): TaskRow;
  getTask(id: string): TaskRow | null;
  listTasks(filter?: { status?: TaskStatus; limit?: number }): TaskRow[];
  updateTask(id: string, patch: UpdateTaskInput): TaskRow | null;
  stopTask(id: string, reason?: string): TaskRow | null;
  deleteTask(id: string): boolean;
  insertTeam(input: InsertTeamInput): TeamRow;
  deleteTeam(id: string): boolean;
  listTeams(): TeamRow[];
  getTeam(id: string): TeamRow | null;
  insertCron(input: InsertCronInput): CronRow;
  listCrons(): CronRow[];
  deleteCron(id: string): boolean;
  insertMessage(input: InsertMessageInput): MessageRow;
  listMessages(filter?: ListMessagesFilter): MessageRow[];
  markMessageRead(id: string): MessageRow | null;
  close(): void;
}

const SCHEMA = `
CREATE TABLE IF NOT EXISTS tasks (
  id TEXT PRIMARY KEY,
  prompt TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'queued',
  output TEXT NOT NULL DEFAULT '',
  meta TEXT NOT NULL DEFAULT '{}',
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS teams (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  members TEXT NOT NULL,
  created_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS crons (
  id TEXT PRIMARY KEY,
  cron_expr TEXT NOT NULL,
  task_id TEXT NOT NULL,
  next_run INTEGER,
  created_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS messages (
  id TEXT PRIMARY KEY,
  to_agent TEXT NOT NULL,
  from_agent TEXT,
  thread_id TEXT,
  body TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  read_at INTEGER
);
CREATE INDEX IF NOT EXISTS idx_tasks_status ON tasks(status);
CREATE INDEX IF NOT EXISTS idx_tasks_created ON tasks(created_at);
CREATE INDEX IF NOT EXISTS idx_messages_to ON messages(to_agent);
CREATE INDEX IF NOT EXISTS idx_messages_thread ON messages(thread_id);
`;

export function defaultDbPath(): string {
  return join(homedir(), ".openseek", "tasks.sqlite");
}

interface TaskDbRow {
  id: string;
  prompt: string;
  status: string;
  output: string;
  meta: string;
  created_at: number;
  updated_at: number;
}

interface TeamDbRow {
  id: string;
  name: string;
  members: string;
  created_at: number;
}

interface CronDbRow {
  id: string;
  cron_expr: string;
  task_id: string;
  next_run: number | null;
  created_at: number;
}

interface MessageDbRow {
  id: string;
  to_agent: string;
  from_agent: string | null;
  thread_id: string | null;
  body: string;
  created_at: number;
  read_at: number | null;
}

function rowToTask(row: TaskDbRow): TaskRow {
  let meta: Record<string, string> = {};
  try {
    meta = JSON.parse(row.meta);
  } catch {
    meta = {};
  }
  return {
    id: row.id,
    prompt: row.prompt,
    status: row.status as TaskStatus,
    output: row.output,
    meta,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function rowToTeam(row: TeamDbRow): TeamRow {
  let members: string[] = [];
  try {
    const parsed = JSON.parse(row.members);
    if (Array.isArray(parsed)) members = parsed.filter((m) => typeof m === "string");
  } catch {
    members = [];
  }
  return {
    id: row.id,
    name: row.name,
    members,
    createdAt: row.created_at,
  };
}

function rowToCron(row: CronDbRow): CronRow {
  return {
    id: row.id,
    cron: row.cron_expr,
    taskId: row.task_id,
    nextRun: row.next_run,
    createdAt: row.created_at,
  };
}

function rowToMessage(row: MessageDbRow): MessageRow {
  return {
    id: row.id,
    toAgent: row.to_agent,
    fromAgent: row.from_agent,
    threadId: row.thread_id,
    body: row.body,
    createdAt: row.created_at,
    readAt: row.read_at,
  };
}

export function openTaskStore(dbPath?: string): TaskStore {
  const path = dbPath ?? defaultDbPath();
  if (path !== ":memory:") {
    try {
      mkdirSync(dirname(path), { recursive: true });
    } catch {
      // best-effort; if mkdir fails the Database open will surface it
    }
  }
  const db = new Database(path);
  db.exec("PRAGMA journal_mode=WAL");
  db.exec(SCHEMA);

  return {
    insertTask(input) {
      const now = Date.now();
      const status = input.status ?? "queued";
      const output = input.output ?? "";
      const meta = JSON.stringify(input.meta ?? {});
      db.prepare(
        "INSERT INTO tasks (id, prompt, status, output, meta, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)",
      ).run(input.id, input.prompt, status, output, meta, now, now);
      return {
        id: input.id,
        prompt: input.prompt,
        status,
        output,
        meta: input.meta ?? {},
        createdAt: now,
        updatedAt: now,
      };
    },
    getTask(id) {
      const row = db.prepare("SELECT * FROM tasks WHERE id = ?").get(id) as
        | TaskDbRow
        | undefined;
      return row ? rowToTask(row) : null;
    },
    listTasks(filter) {
      const limit = filter?.limit ?? 100;
      const rows = filter?.status
        ? (db
            .prepare("SELECT * FROM tasks WHERE status = ? ORDER BY created_at DESC LIMIT ?")
            .all(filter.status, limit) as TaskDbRow[])
        : (db
            .prepare("SELECT * FROM tasks ORDER BY created_at DESC LIMIT ?")
            .all(limit) as TaskDbRow[]);
      return rows.map(rowToTask);
    },
    updateTask(id, patch) {
      const existing = db.prepare("SELECT * FROM tasks WHERE id = ?").get(id) as
        | TaskDbRow
        | undefined;
      if (!existing) return null;
      const current = rowToTask(existing);
      const nextStatus = patch.status ?? current.status;
      const nextOutput = patch.output !== undefined ? patch.output : current.output;
      const nextMeta = patch.meta ? { ...current.meta, ...patch.meta } : current.meta;
      const now = Date.now();
      db.prepare(
        "UPDATE tasks SET status = ?, output = ?, meta = ?, updated_at = ? WHERE id = ?",
      ).run(nextStatus, nextOutput, JSON.stringify(nextMeta), now, id);
      return {
        ...current,
        status: nextStatus,
        output: nextOutput,
        meta: nextMeta,
        updatedAt: now,
      };
    },
    stopTask(id, reason) {
      const existing = db.prepare("SELECT * FROM tasks WHERE id = ?").get(id) as
        | TaskDbRow
        | undefined;
      if (!existing) return null;
      const current = rowToTask(existing);
      const meta = reason ? { ...current.meta, stopReason: reason } : current.meta;
      const now = Date.now();
      db.prepare(
        "UPDATE tasks SET status = ?, meta = ?, updated_at = ? WHERE id = ?",
      ).run("stopped", JSON.stringify(meta), now, id);
      return { ...current, status: "stopped", meta, updatedAt: now };
    },
    deleteTask(id) {
      const res = db.prepare("DELETE FROM tasks WHERE id = ?").run(id);
      return res.changes > 0;
    },
    insertTeam(input) {
      const now = Date.now();
      db.prepare(
        "INSERT INTO teams (id, name, members, created_at) VALUES (?, ?, ?, ?)",
      ).run(input.id, input.name, JSON.stringify(input.members), now);
      return {
        id: input.id,
        name: input.name,
        members: [...input.members],
        createdAt: now,
      };
    },
    deleteTeam(id) {
      const res = db.prepare("DELETE FROM teams WHERE id = ?").run(id);
      return res.changes > 0;
    },
    listTeams() {
      const rows = db
        .prepare("SELECT * FROM teams ORDER BY created_at DESC")
        .all() as TeamDbRow[];
      return rows.map(rowToTeam);
    },
    getTeam(id) {
      const row = db.prepare("SELECT * FROM teams WHERE id = ?").get(id) as
        | TeamDbRow
        | undefined;
      return row ? rowToTeam(row) : null;
    },
    insertCron(input) {
      const now = Date.now();
      db.prepare(
        "INSERT INTO crons (id, cron_expr, task_id, next_run, created_at) VALUES (?, ?, ?, ?, ?)",
      ).run(input.id, input.cron, input.taskId, input.nextRun, now);
      return {
        id: input.id,
        cron: input.cron,
        taskId: input.taskId,
        nextRun: input.nextRun,
        createdAt: now,
      };
    },
    listCrons() {
      const rows = db
        .prepare("SELECT * FROM crons ORDER BY created_at DESC")
        .all() as CronDbRow[];
      return rows.map(rowToCron);
    },
    deleteCron(id) {
      const res = db.prepare("DELETE FROM crons WHERE id = ?").run(id);
      return res.changes > 0;
    },
    insertMessage(input) {
      const now = Date.now();
      const fromAgent = input.fromAgent ?? null;
      const threadId = input.threadId ?? null;
      db.prepare(
        "INSERT INTO messages (id, to_agent, from_agent, thread_id, body, created_at, read_at) VALUES (?, ?, ?, ?, ?, ?, NULL)",
      ).run(input.id, input.toAgent, fromAgent, threadId, input.body, now);
      return {
        id: input.id,
        toAgent: input.toAgent,
        fromAgent,
        threadId,
        body: input.body,
        createdAt: now,
        readAt: null,
      };
    },
    listMessages(filter) {
      const limit = filter?.limit ?? 100;
      const clauses: string[] = [];
      const params: Array<string | number> = [];
      if (filter?.toAgent) {
        clauses.push("to_agent = ?");
        params.push(filter.toAgent);
      }
      if (filter?.threadId) {
        clauses.push("thread_id = ?");
        params.push(filter.threadId);
      }
      if (filter?.unreadOnly) {
        clauses.push("read_at IS NULL");
      }
      const where = clauses.length > 0 ? `WHERE ${clauses.join(" AND ")}` : "";
      params.push(limit);
      const rows = db
        .prepare(
          `SELECT * FROM messages ${where} ORDER BY created_at ASC LIMIT ?`,
        )
        .all(...params) as MessageDbRow[];
      return rows.map(rowToMessage);
    },
    markMessageRead(id) {
      const existing = db.prepare("SELECT * FROM messages WHERE id = ?").get(id) as
        | MessageDbRow
        | undefined;
      if (!existing) return null;
      const now = Date.now();
      db.prepare("UPDATE messages SET read_at = ? WHERE id = ?").run(now, id);
      return { ...rowToMessage(existing), readAt: now };
    },
    close() {
      db.close();
    },
  };
}

// ---------------------------------------------------------------------------
// Process-level singleton wiring
// ---------------------------------------------------------------------------
//
// All built-in tools share one default store, opened on first access. Tests
// can swap it via `setDefaultTaskStore` for `:memory:` isolation.

let _defaultStore: TaskStore | null = null;
let _defaultPath: string | undefined;

export function getDefaultTaskStore(): TaskStore {
  if (_defaultStore) return _defaultStore;
  _defaultStore = openTaskStore(_defaultPath);
  return _defaultStore;
}

export function setDefaultTaskStore(store: TaskStore | null, path?: string): void {
  if (_defaultStore && _defaultStore !== store) {
    try {
      _defaultStore.close();
    } catch {
      // ignore — store may already be closed
    }
  }
  _defaultStore = store;
  _defaultPath = path;
}

let idCounter = 0;
export function nextStoreId(prefix: string): string {
  idCounter += 1;
  const rand = Math.random().toString(36).slice(2, 6);
  return `${prefix}-${idCounter}-${rand}`;
}
