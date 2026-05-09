import { z } from "zod";
import { getDefaultTaskStore } from "../sqlite-store.ts";
import type { Tool, ToolResult } from "../types.ts";

const inputSchema = z.object({
  id: z.string().min(1).describe("Task id to mark stopped."),
  reason: z.string().min(1).optional().describe("Optional reason recorded with the stop event."),
});

type TaskStopInput = z.infer<typeof inputSchema>;

const taskStop: Tool<typeof inputSchema> = {
  name: "task_stop",
  description:
    "Mark a background task as stopped in the SQLite-backed task store (G3.6).",
  inputSchema,
  permission: "ask",
  async call(input: TaskStopInput, ctx): Promise<ToolResult> {
    const updated = getDefaultTaskStore().stopTask(input.id, input.reason);
    if (!updated) {
      ctx.log.warn("task_stop: missing", { id: input.id });
      return { kind: "error", message: `task not found: ${input.id}` };
    }
    return {
      kind: "text",
      text: `[task ${updated.id} stopped${input.reason ? ` reason=${input.reason}` : ""}]`,
    };
  },
};

export default taskStop;
