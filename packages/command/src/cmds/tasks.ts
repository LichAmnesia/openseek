import type { Command, CommandResult } from "../types.ts";

interface Task {
  id: string;
  title: string;
  status: "pending" | "in_progress" | "completed";
}

const tasks: Command = {
  name: "tasks",
  description: "List tracked tasks for the current session.",
  category: "agent",
  isStub: false,
  async handle(ctx): Promise<CommandResult> {
    const list = ((ctx.state?.tasks as Task[] | undefined) ?? []).slice();
    if (list.length === 0) {
      return {
        kind: "text",
        payload: {
          text: "(no tasks — v1.0 will populate from the task tracker subsystem)",
          data: { count: 0, tasks: [] },
        },
      };
    }
    return {
      kind: "text",
      payload: {
        text: list.map((t) => `  [${t.status}] ${t.id} ${t.title}`).join("\n"),
        data: { count: list.length, tasks: list },
      },
    };
  },
};

export default tasks;
