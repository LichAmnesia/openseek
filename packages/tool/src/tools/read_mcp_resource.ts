import { z } from "zod";
import type { Tool, ToolResult } from "../types.ts";
import { getMcpRouter } from "./mcp.ts";

const inputSchema = z.object({
  uri: z
    .string()
    .min(1)
    .describe("MCP resource uri (server-defined; usually scheme://server/path)."),
  server: z
    .string()
    .min(1)
    .optional()
    .describe("Optional server hint; if omitted the URI scheme is matched against connected servers."),
});

type ReadMcpResourceInput = z.infer<typeof inputSchema>;

const readMcpResource: Tool<typeof inputSchema> = {
  name: "read_mcp_resource",
  description:
    "Fetch the contents of a resource published by an MCP server. Concatenates returned text content blocks; binary `blob` payloads are surfaced as base64 markers.",
  inputSchema,
  permission: "auto",
  async call(input: ReadMcpResourceInput, ctx): Promise<ToolResult> {
    const router = getMcpRouter();
    if (!router) {
      return { kind: "error", message: "mcp router not configured" };
    }

    const candidates = input.server
      ? router.get(input.server)
        ? [router.get(input.server)!]
        : []
      : router.list();
    if (candidates.length === 0) {
      return {
        kind: "error",
        message: input.server
          ? `mcp server not connected: ${input.server}`
          : "no mcp servers attached",
      };
    }

    let lastErr: string | undefined;
    for (const handle of candidates) {
      try {
        const res = await handle.readResource(input.uri);
        const parts: string[] = [];
        for (const c of res.contents) {
          if (typeof c.text === "string") {
            parts.push(c.text);
          } else if (typeof c.blob === "string") {
            parts.push(`[binary blob ${c.blob.length} bytes (base64)]`);
          }
        }
        return {
          kind: "text",
          text: `# resource: ${input.uri} (via ${handle.server.name})\n\n${parts.join("\n")}`,
        };
      } catch (err) {
        lastErr = err instanceof Error ? err.message : String(err);
        ctx.log.debug(`read_mcp_resource fallback`, { server: handle.server.name, lastErr });
      }
    }
    return {
      kind: "error",
      message: `read_mcp_resource failed: ${lastErr ?? "no server returned the uri"}`,
    };
  },
};

export default readMcpResource;
