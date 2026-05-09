import { afterEach, expect, test } from "bun:test";
import type { McpClientHandle, McpRouter } from "@openseek/mcp";
import { setMcpRouter } from "../src/tools/mcp.ts";
import readMcpResource from "../src/tools/read_mcp_resource.ts";
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

test("read_mcp_resource returns text contents", async () => {
  setMcpRouter(
    makeRouter({
      notion: {
        server: { name: "notion", transport: "stdio", command: "x" },
        listTools: async () => [],
        callTool: async () => ({ content: [] }),
        listResources: async () => [],
        close: async () => {},
        readResource: async (uri) => ({
          contents: [{ uri, text: "page body" }],
        }),
      },
    }),
  );
  const result = await readMcpResource.call(
    { uri: "notion://server/page-123" },
    makeCtx(makeTmpDir("rmr-")),
  );
  expect(result.kind).toBe("text");
  if (result.kind !== "text") throw new Error("unreachable");
  expect(result.text).toContain("notion://server/page-123");
  expect(result.text).toContain("page body");
});

test("read_mcp_resource schema rejects empty uri", () => {
  const parsed = readMcpResource.inputSchema.safeParse({ uri: "" });
  expect(parsed.success).toBe(false);
});

test("read_mcp_resource errors when no servers attached", async () => {
  setMcpRouter(makeRouter({}));
  const result = await readMcpResource.call(
    { uri: "x://y" },
    makeCtx(makeTmpDir("rmr-")),
  );
  expect(result.kind).toBe("error");
});
