import { afterEach, beforeEach, expect, test } from "bun:test";
import { connectStdio, setStdioSpawn } from "../src/stdio.ts";
import type { McpServerConfig } from "../src/types.ts";

// biome-ignore lint/suspicious/noExplicitAny: tests mock the spawn interface intentionally
type FakeProc = any;

interface ServerStub {
  /** What the fake server replies for each method. */
  responses: Record<string, unknown>;
  /** The most recent JSON-RPC request the test client sent. */
  lastSent?: { method: string; params?: unknown };
}

function makeFakeSpawn(stub: ServerStub): {
  proc: () => FakeProc;
  written: string[];
} {
  const written: string[] = [];

  const factory = (): FakeProc => {
    let stdoutController: ReadableStreamDefaultController<Uint8Array> | null = null;
    const stdoutStream = new ReadableStream<Uint8Array>({
      start(c) {
        stdoutController = c;
      },
    });
    const stdinStream = new WritableStream<Uint8Array>({
      write(chunk) {
        const text = new TextDecoder().decode(chunk);
        written.push(text);
        for (const line of text.split("\n")) {
          if (!line.trim()) continue;
          let parsed: { id?: number | string; method?: string; params?: unknown };
          try {
            parsed = JSON.parse(line);
          } catch {
            continue;
          }
          if (parsed.id !== undefined && parsed.method) {
            stub.lastSent = { method: parsed.method, params: parsed.params };
            const payload = stub.responses[parsed.method] ?? null;
            const reply = `${JSON.stringify({
              jsonrpc: "2.0",
              id: parsed.id,
              result: payload,
            })}\n`;
            stdoutController?.enqueue(new TextEncoder().encode(reply));
          }
        }
      },
    });
    return {
      stdin: stdinStream.getWriter(),
      stdoutReader: stdoutStream.getReader(),
      stderrReader: null,
      kill: () => stdoutController?.close(),
      exited: Promise.resolve(0),
    };
  };

  return { proc: factory, written };
}

const config: McpServerConfig = {
  name: "fake",
  transport: "stdio",
  command: "irrelevant",
};

beforeEach(() => {});
afterEach(() => setStdioSpawn(undefined));

test("connectStdio performs the initialize handshake", async () => {
  const stub: ServerStub = {
    responses: {
      initialize: { protocolVersion: "2024-11-05", capabilities: {} },
    },
  };
  const fake = makeFakeSpawn(stub);
  setStdioSpawn(() => fake.proc());
  const handle = await connectStdio(config);
  expect(stub.lastSent?.method).toBe("initialize");
  expect(handle.server.name).toBe("fake");
  await handle.close();
});

test("listTools / callTool round-trip via JSON-RPC", async () => {
  const stub: ServerStub = {
    responses: {
      initialize: { protocolVersion: "x", capabilities: {} },
      "tools/list": {
        tools: [{ name: "echo", description: "echo back" }],
      },
      "tools/call": {
        content: [{ type: "text", text: "hello" }],
      },
    },
  };
  const fake = makeFakeSpawn(stub);
  setStdioSpawn(() => fake.proc());
  const handle = await connectStdio(config);
  const tools = await handle.listTools();
  expect(tools.length).toBe(1);
  expect(tools[0]?.name).toBe("echo");

  const res = await handle.callTool("echo", { msg: "hello" });
  expect(stub.lastSent?.method).toBe("tools/call");
  expect((stub.lastSent?.params as { name?: string })?.name).toBe("echo");
  expect(res.content[0]?.text).toBe("hello");
  await handle.close();
});

test("listResources / readResource round-trip", async () => {
  const stub: ServerStub = {
    responses: {
      initialize: {},
      "resources/list": {
        resources: [{ uri: "mem://x", name: "x" }],
      },
      "resources/read": {
        contents: [{ uri: "mem://x", text: "data" }],
      },
    },
  };
  const fake = makeFakeSpawn(stub);
  setStdioSpawn(() => fake.proc());
  const handle = await connectStdio(config);
  const resources = await handle.listResources();
  expect(resources[0]?.uri).toBe("mem://x");
  const read = await handle.readResource("mem://x");
  expect(read.contents[0]?.text).toBe("data");
  await handle.close();
});
