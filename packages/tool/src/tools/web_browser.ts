import { z } from "zod";
import type { Tool, ToolResult } from "../types.ts";
import { getMcpRouter } from "./mcp.ts";

const inputSchema = z.object({
  op: z
    .enum(["goto", "click", "type", "screenshot", "evaluate"])
    .describe("Browser operation to perform."),
  url: z.string().url().optional().describe("Target URL for op='goto'."),
  selector: z
    .string()
    .min(1)
    .optional()
    .describe("CSS selector for op='click' / op='type'."),
  text: z.string().optional().describe("Input text for op='type'."),
  script: z.string().min(1).optional().describe("JavaScript snippet for op='evaluate'."),
  server: z
    .string()
    .min(1)
    .optional()
    .describe("MCP server label that exposes the browser tools (default 'chrome-devtools')."),
});

type WebBrowserInput = z.infer<typeof inputSchema>;

const DEFAULT_SERVER = "chrome-devtools";

const OP_TO_TOOL: Record<WebBrowserInput["op"], string> = {
  goto: "navigate_page",
  click: "click",
  type: "type_text",
  screenshot: "take_screenshot",
  evaluate: "evaluate_script",
};

function blocksToText(blocks: Array<{ type: string; text?: string }>): string {
  return blocks
    .map((b) => (b.type === "text" && b.text ? b.text : `[${b.type} block]`))
    .join("\n");
}

const webBrowser: Tool<typeof inputSchema> = {
  name: "web_browser",
  description:
    "Drive a Chromium browser via the chrome-devtools MCP server. Configure the server in .openseek/mcp.json (label 'chrome-devtools' or override via `server`).",
  inputSchema,
  permission: "ask",
  async call(input: WebBrowserInput, ctx): Promise<ToolResult> {
    if (input.op === "goto" && !input.url) {
      return { kind: "error", message: "web_browser goto requires url" };
    }
    if ((input.op === "click" || input.op === "type") && !input.selector) {
      return { kind: "error", message: `web_browser ${input.op} requires selector` };
    }
    if (input.op === "type" && input.text === undefined) {
      return { kind: "error", message: "web_browser type requires text" };
    }
    if (input.op === "evaluate" && !input.script) {
      return { kind: "error", message: "web_browser evaluate requires script" };
    }

    const router = getMcpRouter();
    const serverLabel = input.server ?? DEFAULT_SERVER;
    if (!router) {
      return {
        kind: "error",
        message: `configure ${serverLabel} in .openseek/mcp.json to enable web_browser`,
      };
    }
    const handle = router.get(serverLabel);
    if (!handle) {
      return {
        kind: "error",
        message: `mcp server not connected: ${serverLabel}`,
      };
    }

    const tool = OP_TO_TOOL[input.op];
    const args: Record<string, unknown> = {};
    if (input.op === "goto") args.url = input.url;
    if (input.op === "click" || input.op === "type") args.selector = input.selector;
    if (input.op === "type") args.text = input.text;
    if (input.op === "evaluate") args.script = input.script;

    ctx.log.info("web_browser", { op: input.op, server: serverLabel });
    try {
      const res = await handle.callTool(tool, args);
      const body = blocksToText(res.content);
      if (res.isError) {
        return { kind: "error", message: `web_browser ${input.op}: ${body}` };
      }
      return {
        kind: "text",
        text: `[web_browser ${input.op}] ${body}`,
      };
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      return { kind: "error", message: `web_browser ${input.op} failed: ${msg}` };
    }
  },
};

export default webBrowser;
