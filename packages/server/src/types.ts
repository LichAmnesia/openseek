// HTTP/SSE server types (G6.1).
//
// `ServerConfig` is the public configuration surface. We keep the shape tiny
// so callers can invoke `startServer({ port: 7117 })` without ceremony — the
// rest of the knobs are filled in from sensible defaults.

import type { TaskStore } from "@openseek/tool";

export interface ServerConfig {
  /** TCP port to bind. Default 7117. */
  port?: number;
  /** Bind host. Default "127.0.0.1". */
  host?: string;
  /** Allowed CORS origins. Use `["*"]` for any. Default `["*"]`. */
  corsOrigins?: string[];
  /**
   * Optional task-store override (tests pass `:memory:` stores so the usage
   * endpoint reads from an isolated DB).
   */
  taskStore?: TaskStore;
}

export interface ResolvedServerConfig {
  port: number;
  host: string;
  corsOrigins: string[];
}

export interface ThreadRecord {
  id: string;
  /** ISO timestamp the thread was created. */
  createdAt: string;
  /** Cumulative messages submitted via `POST /v1/threads/:id/messages`. */
  messages: ThreadMessage[];
  /** Cumulative usage; mutated as the underlying agent reports usage events. */
  usage: ThreadUsage;
}

export interface ThreadMessage {
  role: "user" | "assistant" | "system";
  text: string;
  /** ISO timestamp. */
  at: string;
}

export interface ThreadUsage {
  totalIn: number;
  totalOut: number;
  cacheCreation: number;
  cacheRead: number;
}

export type UsageGroupBy = "day" | "model" | "provider" | "thread";

export interface UsageBucket {
  /** Bucket key — date / model / provider / thread id depending on grouping. */
  key: string;
  totalIn: number;
  totalOut: number;
  count: number;
}

export interface UsageResponse {
  groupBy: UsageGroupBy;
  buckets: UsageBucket[];
}

export const DEFAULT_PORT = 7117;
export const DEFAULT_HOST = "127.0.0.1";
export const DEFAULT_CORS_ORIGINS = ["*"];

export function resolveServerConfig(cfg?: ServerConfig): ResolvedServerConfig {
  return {
    port: cfg?.port ?? DEFAULT_PORT,
    host: cfg?.host ?? DEFAULT_HOST,
    corsOrigins: cfg?.corsOrigins ?? DEFAULT_CORS_ORIGINS,
  };
}
