import { afterEach, beforeEach, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { loadMcpConfig } from "../src/config.ts";
import type { McpLogger } from "../src/types.ts";

let home: string;
let workspace: string;

const silent: McpLogger = {
  debug: () => {},
  info: () => {},
  warn: () => {},
  error: () => {},
};

function captureWarns(): { logger: McpLogger; warns: string[] } {
  const warns: string[] = [];
  return {
    warns,
    logger: {
      debug: () => {},
      info: () => {},
      warn: (m) => warns.push(m),
      error: () => {},
    },
  };
}

beforeEach(() => {
  home = mkdtempSync(join(tmpdir(), "mcp-home-"));
  workspace = mkdtempSync(join(tmpdir(), "mcp-ws-"));
});
afterEach(() => {
  rmSync(home, { recursive: true, force: true });
  rmSync(workspace, { recursive: true, force: true });
});

function writeUserConfig(content: string): void {
  const dir = join(home, ".openseek");
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, "mcp.json"), content);
}

function writeWorkspaceConfig(content: string): void {
  const dir = join(workspace, ".openseek");
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, "mcp.json"), content);
}

test("loadMcpConfig parses a minimal stdio entry", () => {
  writeUserConfig(
    JSON.stringify({
      servers: {
        notion: { transport: "stdio", command: "uvx", args: ["mcp-server-notion"] },
      },
    }),
  );
  const cfg = loadMcpConfig({ home, logger: silent });
  expect(cfg.length).toBe(1);
  expect(cfg[0]).toMatchObject({
    name: "notion",
    transport: "stdio",
    command: "uvx",
    args: ["mcp-server-notion"],
  });
});

test("loadMcpConfig returns [] when no files exist", () => {
  const cfg = loadMcpConfig({ home, workspace, logger: silent });
  expect(cfg).toEqual([]);
});

test("loadMcpConfig merges workspace over user (workspace wins by name)", () => {
  writeUserConfig(
    JSON.stringify({
      servers: {
        shared: { transport: "stdio", command: "user-bin" },
        only_user: { transport: "stdio", command: "u" },
      },
    }),
  );
  writeWorkspaceConfig(
    JSON.stringify({
      servers: {
        shared: { transport: "stdio", command: "ws-bin" },
        only_ws: { transport: "stdio", command: "w" },
      },
    }),
  );
  const cfg = loadMcpConfig({ home, workspace, logger: silent });
  const byName = Object.fromEntries(cfg.map((c) => [c.name, c]));
  expect(byName.shared?.command).toBe("ws-bin");
  expect(byName.only_user?.command).toBe("u");
  expect(byName.only_ws?.command).toBe("w");
});

test("loadMcpConfig drops malformed entries with a warning", () => {
  writeUserConfig(
    JSON.stringify({
      servers: {
        bad_transport: { transport: "telegraph", command: "x" },
        bad_stdio_no_command: { transport: "stdio" },
        good: { transport: "websocket", url: "wss://x" },
      },
    }),
  );
  const { logger, warns } = captureWarns();
  const cfg = loadMcpConfig({ home, logger });
  expect(cfg.length).toBe(1);
  expect(cfg[0]?.name).toBe("good");
  expect(warns.length).toBeGreaterThanOrEqual(2);
});

test("loadMcpConfig tolerates broken JSON", () => {
  writeUserConfig("{ not json");
  const { logger, warns } = captureWarns();
  const cfg = loadMcpConfig({ home, logger });
  expect(cfg).toEqual([]);
  expect(warns.some((w) => w.includes("invalid JSON"))).toBe(true);
});
