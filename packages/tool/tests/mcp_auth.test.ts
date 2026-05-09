import { afterEach, expect, test } from "bun:test";
import type { McpClientHandle, McpRouter } from "@openseek/mcp";
import mcpAuth from "../src/tools/mcp_auth.ts";
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

test("mcp_auth surfaces auth url when server returns one", async () => {
  setMcpRouter(
    makeRouter({
      gmail: {
        server: { name: "gmail", transport: "sse", url: "https://x" },
        listTools: async () => [],
        listResources: async () => [],
        readResource: async () => ({ contents: [] }),
        close: async () => {},
        callTool: async (name) => {
          if (name === "auth/status") {
            return {
              content: [{ type: "text", text: "visit https://gmail/auth/abc" }],
            };
          }
          return { content: [], isError: true };
        },
      },
    }),
  );
  const result = await mcpAuth.call({ server: "gmail" }, makeCtx(makeTmpDir("auth-")));
  expect(result.kind).toBe("text");
  if (result.kind !== "text") throw new Error("unreachable");
  expect(result.text).toContain("gmail");
  expect(result.text).toContain("https://gmail/auth/abc");
});

test("mcp_auth schema rejects empty server", () => {
  const parsed = mcpAuth.inputSchema.safeParse({ server: "" });
  expect(parsed.success).toBe(false);
});

test("mcp_auth errors when server not connected", async () => {
  setMcpRouter(makeRouter({}));
  const result = await mcpAuth.call({ server: "x" }, makeCtx(makeTmpDir("auth-")));
  expect(result.kind).toBe("error");
});
