import { z } from "zod";
import { getDefaultTaskStore } from "../sqlite-store.ts";
import type { Tool, ToolResult } from "../types.ts";

const inputSchema = z.object({
  id: z.string().min(1).describe("Task id whose output stream to inspect."),
});

type TaskOutputInput = z.infer<typeof inputSchema>;

const taskOutput: Tool<typeof inputSchema> = {
  name: "task_output",
  description:
    "Fetch a background task's accumulated output snapshot from the SQLite-backed task store (G3.6).",
  inputSchema,
  permission: "auto",
  async call(input: TaskOutputInput, ctx): Promise<ToolResult> {
    const entry = getDefaultTaskStore().getTask(input.id);
    if (!entry) {
      ctx.log.warn("task_output: missing", { id: input.id });
      return { kind: "error", message: `task not found: ${input.id}` };
    }
    if (entry.output && entry.output.length > 0) {
      return {
        kind: "text",
        text: `task ${entry.id} output:\n${entry.output}`,
      };
    }
    return {
      kind: "text",
      text: `[task ${entry.id} output not yet implemented]`,
    };
  },
};

export default taskOutput;
