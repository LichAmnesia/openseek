import { z } from "zod";
import { getDefaultTaskStore, nextStoreId } from "../sqlite-store.ts";
import type { Tool, ToolResult } from "../types.ts";

const inputSchema = z.object({
  toAgent: z.string().min(1).describe("Recipient agent id or role label."),
  message: z.string().min(1).describe("Message body delivered to the recipient."),
  threadId: z
    .string()
    .min(1)
    .optional()
    .describe("Optional conversation thread id for grouping."),
  fromAgent: z
    .string()
    .min(1)
    .optional()
    .describe("Optional sender id (defaults to current agent role from context)."),
});

type SendMessageInput = z.infer<typeof inputSchema>;

const SUMMARY_LIMIT = 120;

function summarize(msg: string): string {
  const trimmed = msg.trim().replace(/\s+/g, " ");
  if (trimmed.length <= SUMMARY_LIMIT) return trimmed;
  return `${trimmed.slice(0, SUMMARY_LIMIT - 1)}…`;
}

const sendMessage: Tool<typeof inputSchema> = {
  name: "send_message",
  description:
    "Send a structured message between agents in a multi-agent run. Persists to the shared sqlite messages table; the recipient queries its inbox via listMessages.",
  inputSchema,
  permission: "ask",
  async call(input: SendMessageInput, ctx): Promise<ToolResult> {
    const store = getDefaultTaskStore();
    const id = nextStoreId("msg");
    try {
      store.insertMessage({
        id,
        toAgent: input.toAgent,
        fromAgent: input.fromAgent ?? null,
        threadId: input.threadId ?? null,
        body: input.message,
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      return { kind: "error", message: `send_message persist failed: ${msg}` };
    }
    ctx.log.info("send_message", { id, to: input.toAgent, threadId: input.threadId });
    const summary = summarize(input.message);
    const thread = input.threadId ? ` thread=${input.threadId}` : "";
    return {
      kind: "text",
      text: `[message ${id} → ${input.toAgent}${thread}]\n${summary}`,
    };
  },
};

export default sendMessage;
