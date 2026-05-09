import { z } from "zod";
import type { Tool, ToolResult } from "../types.ts";
import { getMcpRouter } from "./mcp.ts";

const inputSchema = z.object({
  server: z.string().min(1).describe("MCP server label that requires OAuth/token authentication."),
});

type McpAuthInput = z.infer<typeof inputSchema>;

// OAuth flow is handled per-server via that server's own config (env vars,
// `~/.openseek/mcp.json` overrides, or an in-band `auth_required` notification
// from the server). This tool surfaces a structured prompt the orchestrator
// can show to the user: it asks the connected server for its current auth
// state via the conventional `auth/status` JSON-RPC method, and falls back to
// a plain "configure credentials in mcp.json" message when the server doesn't
// expose one.

const mcpAuth: Tool<typeof inputSchema> = {
  name: "mcp_auth",
  description:
    "Begin / resume authentication for an MCP server. Asks the connected server for its auth status; surfaces an authorization URL when the server reports `auth_required`.",
  inputSchema,
  permission: "ask",
  async call(input: McpAuthInput, ctx): Promise<ToolResult> {
    const router = getMcpRouter();
    if (!router) {
      return { kind: "error", message: "mcp router not configured" };
    }
    const handle = router.get(input.server);
    if (!handle) {
      return {
        kind: "error",
        message: `mcp server not connected: ${input.server}`,
      };
    }

    // Many MCP servers expose an OAuth probe as a regular tool call rather
    // than a dedicated method. Try a `auth/status`-style tool first, then
    // fall back to listing tools for an `auth*` entry.
    try {
      const probe = await handle.callTool("auth/status", {});
      if (!probe.isError) {
        const text = probe.content
          .map((c) => (typeof c.text === "string" ? c.text : `[${c.type}]`))
          .join("\n");
        return {
          kind: "text",
          text: `[mcp_auth ${input.server}]\n${text}`,
        };
      }
    } catch (err) {
      ctx.log.debug("mcp_auth probe failed", err);
    }
    return {
      kind: "text",
      text: `[mcp_auth ${input.server}] server did not advertise an auth flow; configure credentials via env or .openseek/mcp.json`,
    };
  },
};

export default mcpAuth;
