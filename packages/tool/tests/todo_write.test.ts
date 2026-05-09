import { afterEach, beforeEach, expect, test } from "bun:test";
import todoWrite from "../src/tools/todo_write.ts";
import { cleanupTmpDir, makeCtx, makeTmpDir } from "./helpers.ts";

let cwd: string;

beforeEach(() => {
  cwd = makeTmpDir("openseek-todo-write-");
});

afterEach(() => {
  cleanupTmpDir(cwd);
});

test("todo_write renders status glyphs and todo text", async () => {
  const result = await todoWrite.call(
    {
      todos: [
        { id: "1", text: "read failing test", status: "done" },
        { id: "2", text: "fix bug", status: "in_progress" },
        { id: "3", text: "run verify", status: "pending" },
      ],
    },
    makeCtx(cwd),
  );
  expect(result.kind).toBe("text");
  if (result.kind !== "text") throw new Error("unreachable");
  expect(result.text).toContain("[x] 1: read failing test");
  expect(result.text).toContain("[~] 2: fix bug");
  expect(result.text).toContain("[ ] 3: run verify");
});

test("todo_write handles empty list with cleared message", async () => {
  const result = await todoWrite.call({ todos: [] }, makeCtx(cwd));
  expect(result.kind).toBe("text");
  if (result.kind !== "text") throw new Error("unreachable");
  expect(result.text).toBe("(todo list cleared)");
});

test("todo_write rejects unknown status at the schema layer", () => {
  const parsed = todoWrite.inputSchema.safeParse({
    todos: [{ id: "1", text: "x", status: "blocked" }],
  });
  expect(parsed.success).toBe(false);
});

test("todo_write preserves the order of todos", async () => {
  const result = await todoWrite.call(
    {
      todos: [
        { id: "z", text: "last", status: "pending" },
        { id: "a", text: "first", status: "pending" },
      ],
    },
    makeCtx(cwd),
  );
  expect(result.kind).toBe("text");
  if (result.kind !== "text") throw new Error("unreachable");
  const idx1 = result.text.indexOf("z: last");
  const idx2 = result.text.indexOf("a: first");
  expect(idx1).toBeGreaterThanOrEqual(0);
  expect(idx2).toBeGreaterThan(idx1);
});
