// Minimal JSON-RPC 2.0 client used by the stdio / sse / websocket transports.
//
// MCP framing: each message is a single JSON object. Over stdio it is
// line-delimited (one JSON object per line, terminated by `\n`). Over SSE
// the server pushes responses as `data:` events. We expose a tiny "framed"
// API: `send(method, params)` returns a promise that resolves with the
// matching response.
//
// We keep the protocol bits verbatim so MCP-conforming servers can be
// reached without depending on the Node-only @modelcontextprotocol/sdk.

export interface JsonRpcRequest {
  jsonrpc: "2.0";
  id: number | string;
  method: string;
  params?: unknown;
}

export interface JsonRpcNotification {
  jsonrpc: "2.0";
  method: string;
  params?: unknown;
}

export interface JsonRpcResponse {
  jsonrpc: "2.0";
  id: number | string;
  result?: unknown;
  error?: { code: number; message: string; data?: unknown };
}

export type JsonRpcMessage = JsonRpcRequest | JsonRpcResponse | JsonRpcNotification;

export type JsonRpcSendFn = (message: JsonRpcRequest | JsonRpcNotification) => void;

interface PendingCall {
  resolve: (value: unknown) => void;
  reject: (reason: Error) => void;
  timer: ReturnType<typeof setTimeout> | null;
}

export interface JsonRpcClientOptions {
  send: JsonRpcSendFn;
  /** Default per-call timeout in ms. */
  timeoutMs?: number;
}

const DEFAULT_TIMEOUT_MS = 15_000;

export class JsonRpcClient {
  private nextId = 1;
  private pending = new Map<number | string, PendingCall>();
  private closed = false;
  private send: JsonRpcSendFn;
  private timeoutMs: number;

  constructor(opts: JsonRpcClientOptions) {
    this.send = opts.send;
    this.timeoutMs = opts.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  }

  call<T = unknown>(method: string, params?: unknown): Promise<T> {
    if (this.closed) {
      return Promise.reject(new Error("jsonrpc client closed"));
    }
    const id = this.nextId++;
    const req: JsonRpcRequest = { jsonrpc: "2.0", id, method };
    if (params !== undefined) req.params = params;
    return new Promise<T>((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(id);
        reject(new Error(`jsonrpc call timed out: ${method}`));
      }, this.timeoutMs);
      this.pending.set(id, {
        resolve: (v) => resolve(v as T),
        reject,
        timer,
      });
      try {
        this.send(req);
      } catch (err) {
        const pending = this.pending.get(id);
        if (pending?.timer) clearTimeout(pending.timer);
        this.pending.delete(id);
        reject(err instanceof Error ? err : new Error(String(err)));
      }
    });
  }

  notify(method: string, params?: unknown): void {
    if (this.closed) return;
    const note: JsonRpcNotification = { jsonrpc: "2.0", method };
    if (params !== undefined) note.params = params;
    this.send(note);
  }

  /** Hand a parsed message back to the client; resolves/rejects the matching pending call. */
  receive(message: unknown): void {
    if (typeof message !== "object" || message === null) return;
    const m = message as JsonRpcResponse;
    if (m.id === undefined) return; // notification — ignored
    const pending = this.pending.get(m.id);
    if (!pending) return;
    this.pending.delete(m.id);
    if (pending.timer) clearTimeout(pending.timer);
    if (m.error) {
      pending.reject(new Error(`jsonrpc error ${m.error.code}: ${m.error.message}`));
    } else {
      pending.resolve(m.result);
    }
  }

  /** Reject every pending call (called on transport close). */
  close(reason = "transport closed"): void {
    this.closed = true;
    for (const [, p] of this.pending) {
      if (p.timer) clearTimeout(p.timer);
      p.reject(new Error(reason));
    }
    this.pending.clear();
  }
}

/** Split incoming bytes into newline-delimited JSON messages. */
export class LineFramer {
  private buf = "";

  push(chunk: string, onMessage: (msg: unknown) => void): void {
    this.buf += chunk;
    let idx = this.buf.indexOf("\n");
    while (idx !== -1) {
      const line = this.buf.slice(0, idx).trim();
      this.buf = this.buf.slice(idx + 1);
      if (line.length > 0) {
        try {
          onMessage(JSON.parse(line));
        } catch {
          // ignore malformed line; servers occasionally print banners
        }
      }
      idx = this.buf.indexOf("\n");
    }
  }
}

export const MCP_PROTOCOL_VERSION = "2024-11-05";

export interface InitializeParams {
  protocolVersion: string;
  capabilities: {
    roots?: { listChanged?: boolean };
    sampling?: Record<string, unknown>;
  };
  clientInfo: { name: string; version: string };
}

export const DEFAULT_INITIALIZE_PARAMS: InitializeParams = {
  protocolVersion: MCP_PROTOCOL_VERSION,
  capabilities: {},
  clientInfo: { name: "@openseek/mcp", version: "0.0.1" },
};
