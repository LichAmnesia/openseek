// WebSocket MCP transport. Uses the platform WebSocket (Bun ships a
// W3C-compatible global). Frames are full JSON-RPC messages — one per
// websocket message.

import { JsonRpcClient, DEFAULT_INITIALIZE_PARAMS } from "./jsonrpc.ts";
import { makeHandle } from "./stdio.ts";
import {
  type McpClientHandle,
  type McpLogger,
  type McpServerConfig,
  noopMcpLogger,
} from "./types.ts";

export interface WebSocketConnectOptions {
  logger?: McpLogger;
  timeoutMs?: number;
  /** Override WebSocket constructor (tests). */
  // biome-ignore lint/suspicious/noExplicitAny: WebSocket ctor varies across runtimes
  webSocketImpl?: any;
  /** ms to wait for the OPEN event. */
  openTimeoutMs?: number;
}

export async function connectWebSocket(
  config: McpServerConfig,
  opts: WebSocketConnectOptions = {},
): Promise<McpClientHandle> {
  if (!config.url) {
    throw new Error(`websocket transport requires url (server=${config.name})`);
  }
  const log = opts.logger ?? noopMcpLogger;
  // biome-ignore lint/suspicious/noExplicitAny: same as above
  const Ctor: any = opts.webSocketImpl ?? (globalThis as any).WebSocket;
  if (!Ctor) {
    throw new Error("WebSocket global unavailable");
  }
  const ws = new Ctor(config.url);

  await new Promise<void>((resolve, reject) => {
    const t = setTimeout(
      () => reject(new Error("websocket open timed out")),
      opts.openTimeoutMs ?? 5_000,
    );
    ws.addEventListener("open", () => {
      clearTimeout(t);
      resolve();
    });
    ws.addEventListener("error", (ev: unknown) => {
      clearTimeout(t);
      reject(new Error(`websocket error: ${String(ev)}`));
    });
  });

  const send = (msg: unknown): void => {
    try {
      ws.send(JSON.stringify(msg));
    } catch (err) {
      log.warn(`mcp ws[${config.name}] send failed`, err);
    }
  };

  const rpc = new JsonRpcClient({ send, timeoutMs: opts.timeoutMs });

  ws.addEventListener("message", (ev: { data: unknown }) => {
    const data = typeof ev.data === "string" ? ev.data : "";
    if (!data) return;
    try {
      rpc.receive(JSON.parse(data));
    } catch {
      // ignore malformed
    }
  });

  ws.addEventListener("close", () => {
    rpc.close("websocket closed");
  });

  let closed = false;
  const close = async (): Promise<void> => {
    if (closed) return;
    closed = true;
    rpc.close();
    try {
      ws.close();
    } catch {
      // ignore
    }
  };

  await rpc.call("initialize", DEFAULT_INITIALIZE_PARAMS);
  rpc.notify("notifications/initialized");

  return makeHandle(config, rpc, close);
}
