import { afterEach, expect, test } from "bun:test";
import type { McpClientHandle, McpRouter } from "@openseek/mcp";
import listMcpResources from "../src/tools/list_mcp_resources.ts";
import { setMcpRouter } from "../src/tools/mcp.ts";
import { makeCtx, makeTmpDir } from "./helpers.ts";

function makeRouter(handles: Record<string, McpClientHandle>): McpRouter {
  const map = new Map(Object.entries(handles));
  return {
    connect: async () => map,
    get: (n) => map.get(n),
    list: () => Array.from(map.values()),
    configs: () => Array.from(map.values()).map((h) => h.server),
    close: async () => {},
  };
}

afterEach(() => setMcpRouter(undefined));

test("list_mcp_resources returns markdown table across all servers", async () => {
  setMcpRouter(
    makeRouter({
      a: {
        server: { name: "a", transport: "stdio", command: "x" },
        listTools: async () => [],
        callTool: async () => ({ content: [] }),
        readResource: async () => ({ contents: [] }),
        close: async () => {},
        listResources: async () => [
          { uri: "a://r1", name: "r1", mimeType: "text/plain" },
        ],
      },
      b: {
        server: { name: "b", transport: "stdio", command: "x" },
        listTools: async () => [],
        callTool: async () => ({ content: [] }),
        readResource: async () => ({ contents: [] }),
        close: async () => {},
        listResources: async () => [{ uri: "b://r2" }],
      },
    }),
  );
  const result = await listMcpResources.call({}, makeCtx(makeTmpDir("lmr-")));
  expect(result.kind).toBe("text");
  if (result.kind !== "text") throw new Error("unreachable");
  expect(result.text).toContain("all servers");
  expect(result.text).toContain("a://r1");
  expect(result.text).toContain("b://r2");
});

test("list_mcp_resources scopes to a single server", async () => {
  setMcpRouter(
    makeRouter({
      tavily: {
        server: { name: "tavily", transport: "sse", url: "https://x" },
        listTools: async () => [],
        callTool: async () => ({ content: [] }),
        readResource: async () => ({ contents: [] }),
        close: async () => {},
        listResources: async () => [{ uri: "tavily://only" }],
      },
    }),
  );
  const result = await listMcpResources.call(
    { server: "tavily" },
    makeCtx(makeTmpDir("lmr-")),
  );
  if (result.kind !== "text") throw new Error("unreachable");
  expect(result.text).toContain("server=tavily");
  expect(result.text).toContain("tavily://only");
});

test("list_mcp_resources errors when server label missing", async () => {
  setMcpRouter(makeRouter({}));
  const result = await listMcpResources.call(
    { server: "ghost" },
    makeCtx(makeTmpDir("lmr-")),
  );
  expect(result.kind).toBe("error");
});
