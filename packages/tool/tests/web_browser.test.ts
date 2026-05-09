import { afterEach, expect, test } from "bun:test";
import type { McpClientHandle, McpRouter } from "@openseek/mcp";
import { setMcpRouter } from "../src/tools/mcp.ts";
import webBrowser from "../src/tools/web_browser.ts";
import { makeCtx, makeTmpDir } from "./helpers.ts";

interface CallLog {
  tool: string;
  args: Record<string, unknown> | undefined;
}

function makeRouterWith(label: string, log: CallLog[]): McpRouter {
  const handle: McpClientHandle = {
    server: { name: label, transport: "stdio", command: "x" },
    listTools: async () => [],
    listResources: async () => [],
    readResource: async () => ({ contents: [] }),
    close: async () => {},
    callTool: async (tool, args) => {
      log.push({ tool, args });
      return { content: [{ type: "text", text: "ok" }] };
    },
  };
  const map = new Map([[label, handle]]);
  return {
    connect: async () => map,
    get: (n) => map.get(n),
    list: () => Array.from(map.values()),
    configs: () => Array.from(map.values()).map((h) => h.server),
    close: async () => {},
  };
}

afterEach(() => setMcpRouter(undefined));

test("web_browser goto without url errors", async () => {
  const result = await webBrowser.call({ op: "goto" }, makeCtx(makeTmpDir("wb-")));
  expect(result.kind).toBe("error");
  if (result.kind !== "error") throw new Error("unreachable");
  expect(result.message).toContain("requires url");
});

test("web_browser errors when no router configured", async () => {
  const result = await webBrowser.call(
    { op: "goto", url: "https://example.com" },
    makeCtx(makeTmpDir("wb-")),
  );
  expect(result.kind).toBe("error");
  if (result.kind !== "error") throw new Error("unreachable");
  expect(result.message).toContain("chrome-devtools");
});

test("web_browser routes goto -> navigate_page on chrome-devtools server", async () => {
  const log: CallLog[] = [];
  setMcpRouter(makeRouterWith("chrome-devtools", log));
  const result = await webBrowser.call(
    { op: "goto", url: "https://example.com" },
    makeCtx(makeTmpDir("wb-")),
  );
  expect(log[0]?.tool).toBe("navigate_page");
  expect(log[0]?.args).toEqual({ url: "https://example.com" });
  expect(result.kind).toBe("text");
});

test("web_browser type requires selector and text; happy path routes to type_text", async () => {
  const log: CallLog[] = [];
  setMcpRouter(makeRouterWith("chrome-devtools", log));
  const noText = await webBrowser.call(
    { op: "type", selector: "#input" },
    makeCtx(makeTmpDir("wb-")),
  );
  expect(noText.kind).toBe("error");

  const happy = await webBrowser.call(
    { op: "type", selector: "#input", text: "hello" },
    makeCtx(makeTmpDir("wb-")),
  );
  expect(happy.kind).toBe("text");
  expect(log[0]?.tool).toBe("type_text");
  expect(log[0]?.args).toEqual({ selector: "#input", text: "hello" });
});

test("web_browser evaluate requires script", async () => {
  const result = await webBrowser.call({ op: "evaluate" }, makeCtx(makeTmpDir("wb-")));
  expect(result.kind).toBe("error");
});

test("web_browser respects custom server label", async () => {
  const log: CallLog[] = [];
  setMcpRouter(makeRouterWith("custom-browser", log));
  const result = await webBrowser.call(
    { op: "screenshot", server: "custom-browser" },
    makeCtx(makeTmpDir("wb-")),
  );
  expect(result.kind).toBe("text");
  expect(log[0]?.tool).toBe("take_screenshot");
});
