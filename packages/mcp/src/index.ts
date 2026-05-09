// @openseek/mcp — MCP client + router (stdio/SSE/websocket).
//
// Public surface consumed by @openseek/tool's MCP built-ins:
//   * `loadMcpConfig` — read merged user + workspace config
//   * `createMcpRouter` — connect/dispatch/close all servers
//   * Concrete transports for hosts that want to wire one directly

export const PACKAGE_NAME = "@openseek/mcp";

export type {
  McpCallResult,
  McpClientHandle,
  McpContentBlock,
  McpLogger,
  McpReadResourceResult,
  McpResource,
  McpRouter,
  McpServerConfig,
  McpToolDef,
  McpTransport,
} from "./types.ts";
export { noopMcpLogger } from "./types.ts";

export {
  DEFAULT_INITIALIZE_PARAMS,
  JsonRpcClient,
  LineFramer,
  MCP_PROTOCOL_VERSION,
} from "./jsonrpc.ts";

export { connectStdio, makeHandle, setStdioSpawn } from "./stdio.ts";
export { connectSSE } from "./sse.ts";
export { connectWebSocket } from "./websocket.ts";
export { createMcpRouter } from "./router.ts";
export { loadMcpConfig } from "./config.ts";
