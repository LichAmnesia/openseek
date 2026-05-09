// Shared types for the MCP client/router used by @openseek/tool.
//
// Keep this layer minimal & transport-agnostic. The four built-in MCP tools
// (`mcp`, `mcp_auth`, `list_mcp_resources`, `read_mcp_resource`) talk only
// to `McpClientHandle`; concrete transports (stdio/sse/websocket) live in
// sibling files.

export type McpTransport = "stdio" | "sse" | "websocket";

export interface McpServerConfig {
  /** Stable label used by tools to address this server. */
  name: string;
  transport: McpTransport;
  /** stdio: child-process command (e.g. "uvx") */
  command?: string;
  /** stdio: command args */
  args?: string[];
  /** sse / websocket: full URL */
  url?: string;
  /** stdio: extra env vars merged onto the child process */
  env?: Record<string, string>;
}

/** A tool advertised by an attached MCP server. */
export interface McpToolDef {
  name: string;
  description?: string;
  /** JSON-Schema; passed through verbatim from the server. */
  inputSchema?: unknown;
}

/** A resource advertised by an attached MCP server. */
export interface McpResource {
  uri: string;
  name?: string;
  mimeType?: string;
  description?: string;
}

/** Body of a single content block returned by `tools/call` or `resources/read`. */
export interface McpContentBlock {
  type: "text" | "image" | "resource" | string;
  text?: string;
  data?: string;
  mimeType?: string;
}

/** Result of `tools/call` — minimal MCP shape. */
export interface McpCallResult {
  content: McpContentBlock[];
  isError?: boolean;
}

/** Result of `resources/read`. */
export interface McpReadResourceResult {
  contents: Array<{
    uri: string;
    mimeType?: string;
    text?: string;
    blob?: string;
  }>;
}

/** Active connection to a single MCP server. */
export interface McpClientHandle {
  /** Mirror of the originating config — useful for debug prints. */
  server: McpServerConfig;
  listTools(): Promise<McpToolDef[]>;
  callTool(name: string, args?: Record<string, unknown>): Promise<McpCallResult>;
  listResources(): Promise<McpResource[]>;
  readResource(uri: string): Promise<McpReadResourceResult>;
  close(): Promise<void>;
}

/** Exposed by the router; consumed by the four MCP built-in tools. */
export interface McpRouter {
  /** Eagerly connect every configured server. Failures are logged, not thrown. */
  connect(): Promise<Map<string, McpClientHandle>>;
  /** Look up an already-connected server by name. */
  get(name: string): McpClientHandle | undefined;
  /** Snapshot of currently connected handles. */
  list(): McpClientHandle[];
  /** All configured servers (regardless of connection state). */
  configs(): McpServerConfig[];
  close(): Promise<void>;
}

/** Lightweight logger so transports don't depend on @openseek/tool. */
export interface McpLogger {
  debug: (msg: string, meta?: unknown) => void;
  info: (msg: string, meta?: unknown) => void;
  warn: (msg: string, meta?: unknown) => void;
  error: (msg: string, meta?: unknown) => void;
}

export const noopMcpLogger: McpLogger = {
  debug: () => {},
  info: () => {},
  warn: () => {},
  error: () => {},
};
