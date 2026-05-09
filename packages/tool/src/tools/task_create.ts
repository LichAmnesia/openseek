import { z } from "zod";
import { getDefaultTaskStore, nextStoreId } from "../sqlite-store.ts";
import type { Tool, ToolResult } from "../types.ts";

const inputSchema = z.object({
  prompt: z.string().min(1).describe("Task prompt that the queued worker will pick up."),
  name: z
    .string()
    .min(1)
    .max(80)
    .optional()
    .describe("Human-readable label shown in task listings."),
  meta: z
    .record(z.string(), z.string())
    .optional()
    .describe("Free-form key/value metadata stored with the task."),
});

type TaskCreateInput = z.infer<typeof inputSchema>;

const taskCreate: Tool<typeof inputSchema> = {
  name: "task_create",
  description:
    "Enqueue a long-running background task. Persists the task in the SQLite-backed store at ~/.openseek/tasks.sqlite (G3.6).",
  inputSchema,
  permission: "auto",
  async call(input: TaskCreateInput, ctx): Promise<ToolResult> {
    const id = nextStoreId("t");
    const meta: Record<string, string> = { ...(input.meta ?? {}) };
    if (input.name) meta.name = input.name;
    const store = getDefaultTaskStore();
    const row = store.insertTask({ id, prompt: input.prompt, status: "queued", meta });
    ctx.log.info("task_create", { id, name: input.name });
    return {
      kind: "text",
      text: `[task created: id=${row.id} status=${row.status}]`,
    };
  },
};

export default taskCreate;
