import { afterEach, expect, test } from "bun:test";
import type { McpClientHandle, McpRouter } from "@openseek/mcp";
import mcp, { setMcpRouter } from "../src/tools/mcp.ts";
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

test("mcp returns error when router not configured", async () => {
  const result = await mcp.call(
    { server: "x", tool: "y" },
    makeCtx(makeTmpDir("mcp-")),
  );
  expect(result.kind).toBe("error");
});

test("mcp errors when server not connected", async () => {
  setMcpRouter(makeRouter({}));
  const result = await mcp.call(
    { server: "missing", tool: "x" },
    makeCtx(makeTmpDir("mcp-")),
  );
  expect(result.kind).toBe("error");
  if (result.kind !== "error") throw new Error("unreachable");
  expect(result.message).toContain("not connected");
});

test("mcp routes args + returns text content", async () => {
  let receivedName: string | undefined;
  let receivedArgs: Record<string, unknown> | undefined;
  setMcpRouter(
    makeRouter({
      chrome: {
        server: { name: "chrome", transport: "stdio", command: "x" },
        listTools: async () => [],
        listResources: async () => [],
        readResource: async () => ({ contents: [] }),
        close: async () => {},
        callTool: async (name, args) => {
          receivedName = name;
          receivedArgs = args;
          return { content: [{ type: "text", text: "navigated" }] };
        },
      },
    }),
  );
  const result = await mcp.call(
    { server: "chrome", tool: "navigate", args: { url: "https://example.com" } },
    makeCtx(makeTmpDir("mcp-")),
  );
  expect(receivedName).toBe("navigate");
  expect(receivedArgs).toEqual({ url: "https://example.com" });
  expect(result.kind).toBe("text");
  if (result.kind !== "text") throw new Error("unreachable");
  expect(result.text).toContain("[chrome.navigate]");
  expect(result.text).toContain("navigated");
});

test("mcp surfaces server-side errors as error result", async () => {
  setMcpRouter(
    makeRouter({
      s: {
        server: { name: "s", transport: "stdio", command: "x" },
        listTools: async () => [],
        listResources: async () => [],
        readResource: async () => ({ contents: [] }),
        close: async () => {},
        callTool: async () => ({
          content: [{ type: "text", text: "auth required" }],
          isError: true,
        }),
      },
    }),
  );
  const result = await mcp.call(
    { server: "s", tool: "x" },
    makeCtx(makeTmpDir("mcp-")),
  );
  expect(result.kind).toBe("error");
  if (result.kind !== "error") throw new Error("unreachable");
  expect(result.message).toContain("auth required");
});
