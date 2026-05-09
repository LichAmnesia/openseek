import { z } from "zod";
import { getDefaultTaskStore } from "../sqlite-store.ts";
import type { Tool, ToolResult } from "../types.ts";

const inputSchema = z.object({
  id: z.string().min(1).describe("Task id returned by task_create."),
});

type TaskGetInput = z.infer<typeof inputSchema>;

const taskGet: Tool<typeof inputSchema> = {
  name: "task_get",
  description:
    "Look up a queued task by id. Reads from the SQLite-backed task store (G3.6).",
  inputSchema,
  permission: "auto",
  async call(input: TaskGetInput, ctx): Promise<ToolResult> {
    const entry = getDefaultTaskStore().getTask(input.id);
    if (!entry) {
      ctx.log.warn("task_get: missing", { id: input.id });
      return { kind: "error", message: `task not found: ${input.id}` };
    }
    const lines = [
      `task ${entry.id}`,
      `  status: ${entry.status}`,
      `  prompt: ${entry.prompt.slice(0, 200)}`,
      `  createdAt: ${new Date(entry.createdAt).toISOString()}`,
      `  updatedAt: ${new Date(entry.updatedAt).toISOString()}`,
    ];
    if (entry.meta && Object.keys(entry.meta).length > 0) {
      lines.push(`  meta: ${JSON.stringify(entry.meta)}`);
    }
    if (entry.output) lines.push(`  output: ${entry.output}`);
    return { kind: "text", text: lines.join("\n") };
  },
};

export default taskGet;
