import { expect, test } from "bun:test";
import { createMcpRouter } from "../src/router.ts";
import type { McpClientHandle, McpServerConfig } from "../src/types.ts";

function fakeHandle(name: string): McpClientHandle {
  return {
    server: { name, transport: "stdio", command: "x" },
    listTools: async () => [],
    callTool: async () => ({ content: [], isError: false }),
    listResources: async () => [],
    readResource: async () => ({ contents: [] }),
    close: async () => {},
  };
}

test("router connects every server and exposes get()", async () => {
  const configs: McpServerConfig[] = [
    { name: "a", transport: "stdio", command: "x" },
    { name: "b", transport: "stdio", command: "y" },
  ];
  const router = createMcpRouter(configs, {
    connectImpl: async (c) => fakeHandle(c.name),
  });
  const handles = await router.connect();
  expect(handles.size).toBe(2);
  expect(router.get("a")?.server.name).toBe("a");
  expect(router.get("b")?.server.name).toBe("b");
  expect(router.list().length).toBe(2);
  await router.close();
  expect(router.list().length).toBe(0);
});

test("router skips failures without aborting siblings", async () => {
  const configs: McpServerConfig[] = [
    { name: "good", transport: "stdio", command: "x" },
    { name: "bad", transport: "stdio", command: "y" },
  ];
  let warns = 0;
  const router = createMcpRouter(configs, {
    logger: {
      debug: () => {},
      info: () => {},
      warn: () => {
        warns++;
      },
      error: () => {},
    },
    connectImpl: async (c) => {
      if (c.name === "bad") throw new Error("boom");
      return fakeHandle(c.name);
    },
  });
  await router.connect();
  expect(router.get("good")).toBeDefined();
  expect(router.get("bad")).toBeUndefined();
  expect(warns).toBe(1);
});

test("router.close() closes every handle", async () => {
  let closed = 0;
  const handle: McpClientHandle = {
    server: { name: "z", transport: "stdio", command: "x" },
    listTools: async () => [],
    callTool: async () => ({ content: [] }),
    listResources: async () => [],
    readResource: async () => ({ contents: [] }),
    close: async () => {
      closed++;
    },
  };
  const router = createMcpRouter([{ name: "z", transport: "stdio", command: "x" }], {
    connectImpl: async () => handle,
  });
  await router.connect();
  await router.close();
  expect(closed).toBe(1);
});

test("router.configs() reflects input even when nothing connected", async () => {
  const cfgs: McpServerConfig[] = [{ name: "n", transport: "stdio", command: "c" }];
  const router = createMcpRouter(cfgs, {
    connectImpl: async () => {
      throw new Error("nope");
    },
  });
  await router.connect();
  expect(router.configs()).toEqual(cfgs);
  expect(router.list()).toEqual([]);
});
