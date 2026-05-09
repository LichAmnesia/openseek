// @openseek/server — HTTP/SSE headless API (Hono + Bun adapter).
// SPEC G6.1: openseek serve --http exposes thread/message/usage endpoints.

export const PACKAGE_NAME = "@openseek/server";

export { createApp, type AppDeps } from "./app.ts";
export { startServer, type ServerHandle } from "./serve.ts";
export {
  resolveServerConfig,
  DEFAULT_HOST,
  DEFAULT_PORT,
  DEFAULT_CORS_ORIGINS,
  type ServerConfig,
  type ResolvedServerConfig,
  type ThreadRecord,
  type ThreadMessage,
  type ThreadUsage,
  type UsageBucket,
  type UsageGroupBy,
  type UsageResponse,
} from "./types.ts";
