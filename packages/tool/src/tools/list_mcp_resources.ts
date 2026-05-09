import { z } from "zod";
import type { Tool, ToolResult } from "../types.ts";
import { getMcpRouter } from "./mcp.ts";

const inputSchema = z.object({
  server: z
    .string()
    .min(1)
    .optional()
    .describe("Optional MCP server label; omit to list across all attached servers."),
});

type ListMcpResourcesInput = z.infer<typeof inputSchema>;

interface ResourceRow {
  server: string;
  uri: string;
  name: string;
  mimeType: string;
}

function renderTable(rows: ResourceRow[]): string {
  if (rows.length === 0) return "_no resources advertised_";
  const header = "| server | uri | name | mimeType |";
  const sep = "| --- | --- | --- | --- |";
  const body = rows.map(
    (r) =>
      `| ${r.server} | ${r.uri} | ${r.name || "—"} | ${r.mimeType || "—"} |`,
  );
  return [header, sep, ...body].join("\n");
}

const listMcpResources: Tool<typeof inputSchema> = {
  name: "list_mcp_resources",
  description:
    "Enumerate resources published by attached MCP servers (files, prompts, datasets). Returns a markdown table; pass `server` to scope to one.",
  inputSchema,
  permission: "auto",
  async call(input: ListMcpResourcesInput, ctx): Promise<ToolResult> {
    const router = getMcpRouter();
    if (!router) {
      return { kind: "error", message: "mcp router not configured" };
    }
    const handles = input.server
      ? router.get(input.server)
        ? [router.get(input.server)!]
        : []
      : router.list();
    if (input.server && handles.length === 0) {
      return { kind: "error", message: `mcp server not connected: ${input.server}` };
    }
    const rows: ResourceRow[] = [];
    for (const h of handles) {
      try {
        const list = await h.listResources();
        for (const r of list) {
          rows.push({
            server: h.server.name,
            uri: r.uri,
            name: r.name ?? "",
            mimeType: r.mimeType ?? "",
          });
        }
      } catch (err) {
        ctx.log.warn(`list_mcp_resources(${h.server.name}) failed`, err);
      }
    }
    const scope = input.server ? `server=${input.server}` : "all servers";
    return {
      kind: "text",
      text: `# mcp resources (${scope})\n${renderTable(rows)}`,
    };
  },
};

export default listMcpResources;
