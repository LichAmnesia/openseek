import { z } from "zod";
import { getDefaultTaskStore } from "../sqlite-store.ts";
import type { Tool, ToolResult } from "../types.ts";

const inputSchema = z.object({
  status: z
    .enum(["queued", "running", "stopped", "done", "error"])
    .optional()
    .describe("Optional status filter; omit to list everything."),
  limit: z
    .number()
    .int()
    .min(1)
    .max(500)
    .optional()
    .describe("Maximum entries to return (default 100)."),
});

type TaskListInput = z.infer<typeof inputSchema>;

const taskList: Tool<typeof inputSchema> = {
  name: "task_list",
  description:
    "List background tasks tracked by task_create. Queries the SQLite-backed task store (G3.6).",
  inputSchema,
  permission: "auto",
  async call(input: TaskListInput, _ctx): Promise<ToolResult> {
    const limit = input.limit ?? 100;
    const rows = getDefaultTaskStore().listTasks({ status: input.status, limit });
    if (rows.length === 0) {
      return { kind: "text", text: "no tasks" };
    }
    const lines = rows.map(
      (t) => `${t.id}  ${t.status.padEnd(8)} ${t.prompt.slice(0, 60).replace(/\s+/g, " ")}`,
    );
    return {
      kind: "text",
      text: `${rows.length} task(s)\n${lines.join("\n")}`,
    };
  },
};

export default taskList;
