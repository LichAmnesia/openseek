// Load MCP server configs from filesystem.
//
// Lookup order (later entries override earlier ones by name):
//   1. ~/.openseek/mcp.json
//   2. <workspace>/.openseek/mcp.json
//
// File format (Claude Desktop / common MCP config-style):
//   {
//     "servers": {
//       "myserver": {
//         "transport": "stdio",
//         "command": "uvx",
//         "args": ["mcp-server-foo"]
//       }
//     }
//   }
//
// Missing files yield an empty list. Malformed JSON / shape errors are logged
// and skipped — they should never crash startup.

import { existsSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import {
  type McpLogger,
  type McpServerConfig,
  type McpTransport,
  noopMcpLogger,
} from "./types.ts";

const VALID_TRANSPORTS: McpTransport[] = ["stdio", "sse", "websocket"];

function isStringArray(v: unknown): v is string[] {
  return Array.isArray(v) && v.every((x) => typeof x === "string");
}

function isStringRecord(v: unknown): v is Record<string, string> {
  if (typeof v !== "object" || v === null) return false;
  for (const val of Object.values(v as Record<string, unknown>)) {
    if (typeof val !== "string") return false;
  }
  return true;
}

function parseEntry(name: string, raw: unknown, log: McpLogger): McpServerConfig | null {
  if (typeof raw !== "object" || raw === null) {
    log.warn(`mcp config: server ${name} is not an object — skipped`);
    return null;
  }
  const r = raw as Record<string, unknown>;
  const transport = r.transport;
  if (typeof transport !== "string" || !VALID_TRANSPORTS.includes(transport as McpTransport)) {
    log.warn(`mcp config: server ${name} has invalid transport — skipped`);
    return null;
  }
  const cfg: McpServerConfig = { name, transport: transport as McpTransport };
  if (typeof r.command === "string") cfg.command = r.command;
  if (isStringArray(r.args)) cfg.args = r.args;
  if (typeof r.url === "string") cfg.url = r.url;
  if (isStringRecord(r.env)) cfg.env = r.env;

  if (cfg.transport === "stdio" && !cfg.command) {
    log.warn(`mcp config: stdio server ${name} missing command — skipped`);
    return null;
  }
  if ((cfg.transport === "sse" || cfg.transport === "websocket") && !cfg.url) {
    log.warn(`mcp config: ${cfg.transport} server ${name} missing url — skipped`);
    return null;
  }
  return cfg;
}

function readFile(path: string, log: McpLogger): McpServerConfig[] {
  if (!existsSync(path)) return [];
  let raw: string;
  try {
    raw = readFileSync(path, "utf8");
  } catch (err) {
    log.warn(`mcp config: failed to read ${path}`, err);
    return [];
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch (err) {
    log.warn(`mcp config: invalid JSON in ${path}`, err);
    return [];
  }
  const servers = (parsed as { servers?: unknown })?.servers;
  if (typeof servers !== "object" || servers === null) {
    log.warn(`mcp config: ${path} missing top-level "servers" object`);
    return [];
  }
  const out: McpServerConfig[] = [];
  for (const [name, value] of Object.entries(servers as Record<string, unknown>)) {
    const cfg = parseEntry(name, value, log);
    if (cfg) out.push(cfg);
  }
  return out;
}

export interface LoadOptions {
  workspace?: string;
  /** Override $HOME (tests). */
  home?: string;
  logger?: McpLogger;
}

export function loadMcpConfig(opts: LoadOptions = {}): McpServerConfig[] {
  const log = opts.logger ?? noopMcpLogger;
  const home = opts.home ?? homedir();
  const userPath = join(home, ".openseek", "mcp.json");
  const workspacePath = opts.workspace
    ? join(opts.workspace, ".openseek", "mcp.json")
    : null;

  const merged = new Map<string, McpServerConfig>();
  for (const c of readFile(userPath, log)) merged.set(c.name, c);
  if (workspacePath) {
    for (const c of readFile(workspacePath, log)) merged.set(c.name, c);
  }
  return Array.from(merged.values());
}
