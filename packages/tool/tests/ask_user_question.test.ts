import { afterEach, beforeEach, expect, test } from "bun:test";
import askUserQuestion, {
  setAskUserHandler,
} from "../src/tools/ask_user_question.ts";
import { cleanupTmpDir, makeCtx, makeTmpDir } from "./helpers.ts";

let cwd: string;

beforeEach(() => {
  cwd = makeTmpDir("openseek-ask-");
});

afterEach(() => {
  cleanupTmpDir(cwd);
  setAskUserHandler(undefined);
});

test("ask_user_question renders awaiting payload when no handler", async () => {
  const result = await askUserQuestion.call(
    {
      question: "Which framework?",
      options: ["Vite", "Webpack", "Turbopack"],
    },
    makeCtx(cwd),
  );
  expect(result.kind).toBe("text");
  if (result.kind !== "text") throw new Error("unreachable");
  expect(result.text).toContain("[awaiting user response]");
  expect(result.text).toContain("Q: Which framework?");
  expect(result.text).toContain("1. Vite");
});

test("ask_user_question routes through installed handler", async () => {
  let captured: { question: string; options: string[]; allowFreeForm: boolean } | undefined;
  setAskUserHandler(async (req) => {
    captured = req;
    return req.options[1] ?? "fallback";
  });
  const result = await askUserQuestion.call(
    { question: "pick one", options: ["a", "b"], allowFreeForm: true },
    makeCtx(cwd),
  );
  expect(captured).toEqual({
    question: "pick one",
    options: ["a", "b"],
    allowFreeForm: true,
  });
  expect(result.kind).toBe("text");
  if (result.kind !== "text") throw new Error("unreachable");
  expect(result.text).toBe("b");
});

test("ask_user_question echoes free-form hint when allowed and no handler", async () => {
  const result = await askUserQuestion.call(
    {
      question: "Pick or type",
      options: ["A", "B"],
      allowFreeForm: true,
    },
    makeCtx(cwd),
  );
  if (result.kind !== "text") throw new Error("unreachable");
  expect(result.text).toContain("free-form answer also accepted");
});

test("ask_user_question surfaces handler errors", async () => {
  setAskUserHandler(async () => {
    throw new Error("user cancelled");
  });
  const result = await askUserQuestion.call(
    { question: "x", options: ["a", "b"] },
    makeCtx(cwd),
  );
  expect(result.kind).toBe("error");
  if (result.kind !== "error") throw new Error("unreachable");
  expect(result.message).toContain("user cancelled");
});

test("ask_user_question rejects too-few options at the schema layer", () => {
  const parsed = askUserQuestion.inputSchema.safeParse({
    question: "ok?",
    options: ["only one"],
  });
  expect(parsed.success).toBe(false);
});

test("ask_user_question rejects too-many options at the schema layer", () => {
  const parsed = askUserQuestion.inputSchema.safeParse({
    question: "ok?",
    options: Array.from({ length: 9 }, (_, i) => `o${i}`),
  });
  expect(parsed.success).toBe(false);
});
