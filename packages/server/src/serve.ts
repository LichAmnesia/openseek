// Boot a real HTTP server (Bun.serve) using the Hono app.
//
// Surface is intentionally tiny — `startServer` returns a `stop()` so callers
// (cli, tests) can shut it down deterministically. We avoid binding ports in
// unit tests; instead use `app.fetch(req)` directly via `createApp`.

import { createApp } from "./app.ts";
import { resolveServerConfig, type ServerConfig } from "./types.ts";

export interface ServerHandle {
  /** Resolved port the server is listening on (after bind). */
  port: number;
  host: string;
  /** Stop the server and resolve when the underlying socket closes. */
  stop: () => Promise<void>;
}

export function startServer(cfg: ServerConfig = {}): ServerHandle {
  const resolved = resolveServerConfig(cfg);
  const app = createApp(cfg);

  const server = Bun.serve({
    port: resolved.port,
    hostname: resolved.host,
    fetch: (req: Request) => app.fetch(req),
  });

  return {
    port: server.port ?? resolved.port,
    host: resolved.host,
    stop: async () => {
      server.stop(true);
    },
  };
}
