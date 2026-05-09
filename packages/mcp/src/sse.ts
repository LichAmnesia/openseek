// SSE MCP transport. The SSE flavor of MCP uses two channels:
//   * incoming server-sent events on `<url>` (HTTP GET, content-type
//     `text/event-stream`), which deliver JSON-RPC responses as `data:` payloads
//   * outgoing JSON-RPC requests POSTed to a session URL the server hands back
//     in its first `endpoint` event.
//
// We keep the dependency surface tiny: just `fetch` + a parsed ReadableStream.

import { JsonRpcClient, DEFAULT_INITIALIZE_PARAMS } from "./jsonrpc.ts";
import { makeHandle } from "./stdio.ts";
import {
  type McpClientHandle,
  type McpLogger,
  type McpServerConfig,
  noopMcpLogger,
} from "./types.ts";

export interface SseConnectOptions {
  logger?: McpLogger;
  timeoutMs?: number;
  /** Override fetch (tests). */
  fetchImpl?: typeof fetch;
}

const utf8 = new TextDecoder();

interface SseEvent {
  event: string;
  data: string;
}

function parseSseFrame(buf: string): { events: SseEvent[]; rest: string } {
  const events: SseEvent[] = [];
  let rest = buf;
  let split = rest.indexOf("\n\n");
  while (split !== -1) {
    const block = rest.slice(0, split);
    rest = rest.slice(split + 2);
    let eventName = "message";
    const dataLines: string[] = [];
    for (const line of block.split("\n")) {
      if (line.startsWith("event:")) eventName = line.slice(6).trim();
      else if (line.startsWith("data:")) dataLines.push(line.slice(5).trim());
    }
    events.push({ event: eventName, data: dataLines.join("\n") });
    split = rest.indexOf("\n\n");
  }
  return { events, rest };
}

export async function connectSSE(
  config: McpServerConfig,
  opts: SseConnectOptions = {},
): Promise<McpClientHandle> {
  if (!config.url) {
    throw new Error(`sse transport requires url (server=${config.name})`);
  }
  const log = opts.logger ?? noopMcpLogger;
  const fetchFn = opts.fetchImpl ?? fetch;

  const res = await fetchFn(config.url, {
    headers: { Accept: "text/event-stream" },
  });
  if (!res.ok || !res.body) {
    throw new Error(`sse connect failed: HTTP ${res.status}`);
  }

  let postUrl = config.url;
  let endpointResolved = false;
  let endpointResolve: () => void = () => {};
  const endpointReady = new Promise<void>((r) => {
    endpointResolve = r;
  });

  const send = (msg: unknown): void => {
    fetchFn(postUrl, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(msg),
    }).catch((err) => log.warn(`mcp sse[${config.name}] post failed`, err));
  };

  const rpc = new JsonRpcClient({ send, timeoutMs: opts.timeoutMs });

  let closed = false;
  const reader = res.body.getReader();
  let buf = "";

  (async () => {
    try {
      while (!closed) {
        const { value, done } = await reader.read();
        if (done) break;
        if (!value) continue;
        buf += utf8.decode(value);
        const { events, rest } = parseSseFrame(buf);
        buf = rest;
        for (const ev of events) {
          if (ev.event === "endpoint") {
            postUrl = ev.data || postUrl;
            if (!endpointResolved) {
              endpointResolved = true;
              endpointResolve();
            }
          } else {
            try {
              rpc.receive(JSON.parse(ev.data));
            } catch {
              // ignore malformed
            }
          }
        }
      }
    } catch (err) {
      log.debug(`mcp sse[${config.name}] stream error`, err);
    } finally {
      rpc.close("sse stream closed");
    }
  })();

  // Wait briefly for endpoint event; some servers skip it and use the GET URL.
  await Promise.race([
    endpointReady,
    new Promise<void>((r) => setTimeout(r, 500)),
  ]);

  const close = async (): Promise<void> => {
    if (closed) return;
    closed = true;
    rpc.close();
    try {
      await reader.cancel();
    } catch {
      // ignore
    }
  };

  await rpc.call("initialize", DEFAULT_INITIALIZE_PARAMS);
  rpc.notify("notifications/initialized");

  return makeHandle(config, rpc, close);
}
