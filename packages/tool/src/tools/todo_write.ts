import { z } from "zod";
import type { Tool, ToolResult } from "../types.ts";

const todoStatus = z.enum(["pending", "in_progress", "done"]);

const todoItem = z.object({
  id: z.string().min(1).describe("Stable id for the todo (caller-managed)."),
  text: z.string().min(1).describe("Human-readable todo description."),
  status: todoStatus.describe("Lifecycle status: pending / in_progress / done."),
});

const inputSchema = z.object({
  todos: z.array(todoItem).describe("Full replacement todo list (not a diff)."),
});

type TodoWriteInput = z.infer<typeof inputSchema>;

const STATUS_GLYPH: Record<z.infer<typeof todoStatus>, string> = {
  pending: "[ ]",
  in_progress: "[~]",
  done: "[x]",
};

const todoWrite: Tool<typeof inputSchema> = {
  name: "todo_write",
  description:
    "Render and acknowledge an in-session todo list. v0.2 echoes the list back; v0.3 will persist it to SessionMemory.",
  inputSchema,
  permission: "auto",
  async call(input: TodoWriteInput, ctx): Promise<ToolResult> {
    if (input.todos.length === 0) {
      ctx.log.debug("todo_write: empty list");
      return { kind: "text", text: "(todo list cleared)" };
    }
    ctx.log.debug("todo_write", { count: input.todos.length });
    const lines = input.todos.map((t) => {
      const glyph = STATUS_GLYPH[t.status];
      return `${glyph} ${t.id}: ${t.text}`;
    });
    return { kind: "text", text: lines.join("\n") };
  },
};

export default todoWrite;
