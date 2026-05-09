import { z } from "zod";
import type { Tool, ToolResult } from "../types.ts";

const inputSchema = z.object({
  url: z.string().url().describe("Webhook URL to ping (https recommended)."),
  payload: z
    .record(z.string(), z.unknown())
    .optional()
    .describe("Optional JSON payload that the impl will POST."),
  headers: z
    .record(z.string(), z.string())
    .optional()
    .describe("Optional extra HTTP headers (e.g. an Authorization bearer)."),
});

type RemoteTriggerInput = z.infer<typeof inputSchema>;

const SUMMARY_LIMIT = 400;

// ---------- DI slot for tests ----------
let injectedFetch: typeof fetch | undefined;

export function setRemoteTriggerFetch(impl: typeof fetch | undefined): void {
  injectedFetch = impl;
}

const remoteTrigger: Tool<typeof inputSchema> = {
  name: "remote_trigger",
  description:
    "Fire a remote webhook (CI re-run, deploy hook, n8n flow, etc.) by POSTing JSON. Returns the response status + body summary.",
  inputSchema,
  permission: "ask",
  async call(input: RemoteTriggerInput, ctx): Promise<ToolResult> {
    const fetchFn = injectedFetch ?? fetch;
    const body = JSON.stringify(input.payload ?? {});
    let res: Response;
    try {
      res = await fetchFn(input.url, {
        method: "POST",
        signal: ctx.abort,
        headers: {
          "content-type": "application/json",
          ...(input.headers ?? {}),
        },
        body,
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      return { kind: "error", message: `remote_trigger fetch failed: ${msg}` };
    }
    let respText = "";
    try {
      respText = await res.text();
    } catch {
      respText = "[unreadable body]";
    }
    if (respText.length > SUMMARY_LIMIT) {
      respText = `${respText.slice(0, SUMMARY_LIMIT - 1)}…`;
    }
    ctx.log.info("remote_trigger", { url: input.url, status: res.status });
    if (!res.ok) {
      return {
        kind: "error",
        message: `remote_trigger HTTP ${res.status} ${res.statusText}: ${respText}`,
      };
    }
    return {
      kind: "text",
      text: `[remote_trigger ${res.status} ${input.url}]\n${respText}`,
    };
  },
};

export default remoteTrigger;
