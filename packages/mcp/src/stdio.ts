// stdio MCP transport: spawn a child process, exchange JSON-RPC over its
// stdin/stdout. Stderr is logged at debug level.
//
// We deliberately do NOT depend on @modelcontextprotocol/sdk — that package
// targets Node, and the wire format is small enough to do directly.

import {
  DEFAULT_INITIALIZE_PARAMS,
  JsonRpcClient,
  LineFramer,
} from "./jsonrpc.ts";
import {
  type McpCallResult,
  type McpClientHandle,
  type McpLogger,
  type McpReadResourceResult,
  type McpResource,
  type McpServerConfig,
  type McpToolDef,
  noopMcpLogger,
} from "./types.ts";

interface SpawnedChild {
  stdin: WritableStreamDefaultWriter<Uint8Array>;
  stdoutReader: ReadableStreamDefaultReader<Uint8Array>;
  stderrReader: ReadableStreamDefaultReader<Uint8Array> | null;
  kill: () => void;
  exited: Promise<number>;
}

type SpawnAdapter = (config: McpServerConfig) => SpawnedChild;

const utf8 = new TextDecoder();

function defaultSpawn(config: McpServerConfig): SpawnedChild {
  if (!config.command) {
    throw new Error(`stdio transport requires command (server=${config.name})`);
  }
  // biome-ignore lint/suspicious/noExplicitAny: Bun.spawn type lives in @types/bun
  const Spawn = (globalThis as any).Bun?.spawn;
  if (typeof Spawn !== "function") {
    throw new Error("Bun.spawn unavailable; stdio transport needs the Bun runtime");
  }
  const proc = Spawn({
    cmd: [config.command, ...(config.args ?? [])],
    stdin: "pipe",
    stdout: "pipe",
    stderr: "pipe",
    env: { ...process.env, ...(config.env ?? {}) },
  });
  return {
    stdin: proc.stdin.getWriter(),
    stdoutReader: proc.stdout.getReader(),
    stderrReader: proc.stderr?.getReader() ?? null,
    kill: () => proc.kill(),
    exited: proc.exited,
  };
}

let _spawnImpl: SpawnAdapter = defaultSpawn;

/** Test-only override; pass `undefined` to restore the real spawn. */
export function setStdioSpawn(impl: SpawnAdapter | undefined): void {
  _spawnImpl = impl ?? defaultSpawn;
}

export interface StdioConnectOptions {
  logger?: McpLogger;
  /** Per-call timeout (ms). */
  timeoutMs?: number;
}

export async function connectStdio(
  config: McpServerConfig,
  opts: StdioConnectOptions = {},
): Promise<McpClientHandle> {
  const log = opts.logger ?? noopMcpLogger;
  const child = _spawnImpl(config);
  const framer = new LineFramer();

  const send = (msg: unknown): void => {
    const line = `${JSON.stringify(msg)}\n`;
    child.stdin.write(new TextEncoder().encode(line)).catch((err: unknown) => {
      log.warn(`mcp stdio[${config.name}] write failed`, err);
    });
  };

  const rpc = new JsonRpcClient({ send, timeoutMs: opts.timeoutMs });

  let closed = false;
  const close = async (): Promise<void> => {
    if (closed) return;
    closed = true;
    rpc.close();
    try {
      await child.stdin.close();
    } catch {
      // ignore
    }
    child.kill();
  };

  // stdout pump
  (async () => {
    try {
      while (!closed) {
        const { value, done } = await child.stdoutReader.read();
        if (done) break;
        if (value) framer.push(utf8.decode(value), (m) => rpc.receive(m));
      }
    } catch (err) {
      log.debug(`mcp stdio[${config.name}] stdout error`, err);
    } finally {
      rpc.close("stdio stdout closed");
    }
  })();

  // stderr pump (debug only)
  const stderrReader = child.stderrReader;
  if (stderrReader) {
    (async () => {
      try {
        while (!closed) {
          const { value, done } = await stderrReader.read();
          if (done) break;
          if (value) log.debug(`mcp stdio[${config.name}] stderr`, utf8.decode(value));
        }
      } catch {
        // ignore
      }
    })();
  }

  // initialize handshake
  await rpc.call("initialize", DEFAULT_INITIALIZE_PARAMS);
  rpc.notify("notifications/initialized");

  return makeHandle(config, rpc, close);
}

export function makeHandle(
  config: McpServerConfig,
  rpc: JsonRpcClient,
  close: () => Promise<void>,
): McpClientHandle {
  return {
    server: config,
    async listTools(): Promise<McpToolDef[]> {
      const res = (await rpc.call<{ tools?: McpToolDef[] }>("tools/list")) ?? {};
      return Array.isArray(res.tools) ? res.tools : [];
    },
    async callTool(name: string, args?: Record<string, unknown>): Promise<McpCallResult> {
      const res = await rpc.call<McpCallResult>("tools/call", {
        name,
        arguments: args ?? {},
      });
      return {
        content: Array.isArray(res?.content) ? res.content : [],
        isError: res?.isError === true,
      };
    },
    async listResources(): Promise<McpResource[]> {
      const res = (await rpc.call<{ resources?: McpResource[] }>("resources/list")) ?? {};
      return Array.isArray(res.resources) ? res.resources : [];
    },
    async readResource(uri: string): Promise<McpReadResourceResult> {
      const res = await rpc.call<McpReadResourceResult>("resources/read", { uri });
      return {
        contents: Array.isArray(res?.contents) ? res.contents : [],
      };
    },
    close,
  };
}
