import { z } from "zod";
import type { McpRouter } from "@openseek/mcp";
import type { Tool, ToolResult } from "../types.ts";

const inputSchema = z.object({
  server: z.string().min(1).describe("MCP server label (matches mcp config entry)."),
  tool: z.string().min(1).describe("Tool exposed by that server."),
  args: z
    .record(z.string(), z.unknown())
    .optional()
    .describe("JSON-serialisable arguments forwarded to the MCP tool."),
});

type McpInput = z.infer<typeof inputSchema>;

// ---------- DI slot ----------
//
// The router is owned by the host process (cli/server). Built-in tools see
// it through a setter so tests can inject a fake without booting a real
// process. When unset every MCP tool returns a clear "not configured"
// error instead of pretending to work.

let injectedRouter: McpRouter | undefined;

export function setMcpRouter(router: McpRouter | undefined): void {
  injectedRouter = router;
}

export function getMcpRouter(): McpRouter | undefined {
  return injectedRouter;
}

function blocksToText(blocks: Array<{ type: string; text?: string }>): string {
  const lines: string[] = [];
  for (const b of blocks) {
    if (b.type === "text" && typeof b.text === "string") {
      lines.push(b.text);
    } else {
      lines.push(`[${b.type} block]`);
    }
  }
  return lines.join("\n");
}

const mcp: Tool<typeof inputSchema> = {
  name: "mcp",
  description:
    "Invoke a tool exposed by an attached MCP server. Routes through @openseek/mcp router; configure servers in ~/.openseek/mcp.json or <workspace>/.openseek/mcp.json.",
  inputSchema,
  permission: "auto",
  async call(input: McpInput, ctx): Promise<ToolResult> {
    if (!injectedRouter) {
      return {
        kind: "error",
        message: "mcp router not configured (no servers attached)",
      };
    }
    const handle = injectedRouter.get(input.server);
    if (!handle) {
      return {
        kind: "error",
        message: `mcp server not connected: ${input.server}`,
      };
    }
    ctx.log.info("mcp call", { server: input.server, tool: input.tool });
    try {
      const res = await handle.callTool(input.tool, input.args ?? {});
      const text = blocksToText(res.content);
      const header = `[${input.server}.${input.tool}${res.isError ? " error" : ""}]`;
      if (res.isError) {
        return { kind: "error", message: `${header}\n${text}` };
      }
      return { kind: "text", text: `${header}\n${text}` };
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      return { kind: "error", message: `mcp call failed: ${msg}` };
    }
  },
};

export default mcp;
