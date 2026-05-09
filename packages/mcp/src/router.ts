// MCP router: connect every configured server eagerly, surface stable
// `get(name)` lookups, log + skip failures.

import { connectSSE } from "./sse.ts";
import { connectStdio } from "./stdio.ts";
import { connectWebSocket } from "./websocket.ts";
import {
  type McpClientHandle,
  type McpLogger,
  type McpRouter,
  type McpServerConfig,
  noopMcpLogger,
} from "./types.ts";

export interface CreateRouterOptions {
  logger?: McpLogger;
  /** Per-call timeout for client RPC. */
  timeoutMs?: number;
  /** Test hook: replace the per-config connect step entirely. */
  connectImpl?: (config: McpServerConfig) => Promise<McpClientHandle>;
}

async function defaultConnect(
  config: McpServerConfig,
  opts: CreateRouterOptions,
): Promise<McpClientHandle> {
  const inner = { logger: opts.logger, timeoutMs: opts.timeoutMs };
  switch (config.transport) {
    case "stdio":
      return connectStdio(config, inner);
    case "sse":
      return connectSSE(config, inner);
    case "websocket":
      return connectWebSocket(config, inner);
    default: {
      const t: string = (config as { transport?: string }).transport ?? "?";
      throw new Error(`unknown mcp transport: ${t}`);
    }
  }
}

export function createMcpRouter(
  configs: McpServerConfig[],
  opts: CreateRouterOptions = {},
): McpRouter {
  const log = opts.logger ?? noopMcpLogger;
  const handles = new Map<string, McpClientHandle>();
  let connected = false;

  return {
    async connect(): Promise<Map<string, McpClientHandle>> {
      if (connected) return handles;
      connected = true;
      const fn = opts.connectImpl ?? ((c) => defaultConnect(c, opts));
      const results = await Promise.allSettled(
        configs.map(async (c) => [c.name, await fn(c)] as const),
      );
      for (let i = 0; i < results.length; i++) {
        const r = results[i];
        const cfg = configs[i];
        if (!r || !cfg) continue;
        if (r.status === "fulfilled") {
          const [name, handle] = r.value;
          handles.set(name, handle);
          log.info(`mcp connected: ${cfg.name} (${cfg.transport})`);
        } else {
          const reason = r.reason instanceof Error ? r.reason.message : String(r.reason);
          log.warn(`mcp connect failed: ${cfg.name} (${cfg.transport}) — ${reason}`);
        }
      }
      return handles;
    },
    get(name: string): McpClientHandle | undefined {
      return handles.get(name);
    },
    list(): McpClientHandle[] {
      return Array.from(handles.values());
    },
    configs(): McpServerConfig[] {
      return [...configs];
    },
    async close(): Promise<void> {
      const arr = Array.from(handles.values());
      handles.clear();
      await Promise.allSettled(arr.map((h) => h.close()));
    },
  };
}
