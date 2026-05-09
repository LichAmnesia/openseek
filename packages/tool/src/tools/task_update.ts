import { z } from "zod";
import { getDefaultTaskStore } from "../sqlite-store.ts";
import type { Tool, ToolResult } from "../types.ts";

const inputSchema = z.object({
  id: z.string().min(1).describe("Task id to mutate."),
  status: z
    .enum(["queued", "running", "stopped", "done", "error"])
    .optional()
    .describe("New status if changing."),
  output: z.string().optional().describe("Append-or-replace output snapshot."),
  meta: z
    .record(z.string(), z.string())
    .optional()
    .describe("Additional metadata; merges with existing entry meta."),
});

type TaskUpdateInput = z.infer<typeof inputSchema>;

const taskUpdate: Tool<typeof inputSchema> = {
  name: "task_update",
  description:
    "Patch an existing task entry's status / output / metadata in the SQLite-backed task store (G3.6).",
  inputSchema,
  permission: "auto",
  async call(input: TaskUpdateInput, ctx): Promise<ToolResult> {
    const updated = getDefaultTaskStore().updateTask(input.id, {
      status: input.status,
      output: input.output,
      meta: input.meta,
    });
    if (!updated) {
      ctx.log.warn("task_update: missing", { id: input.id });
      return { kind: "error", message: `task not found: ${input.id}` };
    }
    return {
      kind: "text",
      text: `[task ${updated.id} updated status=${updated.status}]`,
    };
  },
};

export default taskUpdate;
