import { z } from "zod";
import { parseCron } from "../cron.ts";
import { getDefaultTaskStore, nextStoreId } from "../sqlite-store.ts";
import type { Tool, ToolResult } from "../types.ts";

const inputSchema = z.object({
  cron: z
    .string()
    .min(1)
    .describe(
      "Cron expression. Supported: '*/N * * * *', 'M H * * *', '@hourly', '@daily', '@weekly'.",
    ),
  taskId: z
    .string()
    .min(1)
    .describe("Task id (from task_create) the cron should re-trigger."),
});

type ScheduleCronInput = z.infer<typeof inputSchema>;

const scheduleCron: Tool<typeof inputSchema> = {
  name: "schedule_cron",
  description:
    "Validate a cron expression and persist the binding in the SQLite-backed crons table (G3.8). Computes the next run time but does NOT start a daemon — the v0.6 server will read the table.",
  inputSchema,
  permission: "ask",
  async call(input: ScheduleCronInput, ctx): Promise<ToolResult> {
    const store = getDefaultTaskStore();
    if (!store.getTask(input.taskId)) {
      ctx.log.warn("schedule_cron: unknown taskId", { taskId: input.taskId });
      return { kind: "error", message: `task not found: ${input.taskId}` };
    }
    let nextRun: number | null;
    try {
      const parsed = parseCron(input.cron);
      nextRun = parsed.nextRun(Date.now());
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      return { kind: "error", message: `invalid cron expression: ${msg}` };
    }
    const id = nextStoreId("cron");
    const row = store.insertCron({ id, cron: input.cron, taskId: input.taskId, nextRun });
    return {
      kind: "text",
      text: `[cron scheduled: id=${row.id} expr='${row.cron}' task=${row.taskId} nextRun=${
        row.nextRun ? new Date(row.nextRun).toISOString() : "never"
      }]`,
    };
  },
};

export default scheduleCron;
