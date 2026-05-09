import { afterEach, beforeEach, expect, test } from "bun:test";
import exitPlanMode from "../src/tools/exit_plan_mode.ts";
import { cleanupTmpDir, makeCtx, makeTmpDir } from "./helpers.ts";

let cwd: string;

beforeEach(() => {
  cwd = makeTmpDir("openseek-exit-plan-");
});

afterEach(() => {
  cleanupTmpDir(cwd);
});

test("exit_plan_mode emits a mode-signal ack", async () => {
  const result = await exitPlanMode.call({}, makeCtx(cwd));
  expect(result.kind).toBe("text");
  if (result.kind !== "text") throw new Error("unreachable");
  expect(result.text).toContain("[mode-signal]");
  expect(result.text).toContain("exit_plan_mode acknowledged");
});

test("exit_plan_mode echoes the summary when provided", async () => {
  const result = await exitPlanMode.call(
    { summary: "3-step refactor confirmed" },
    makeCtx(cwd),
  );
  expect(result.kind).toBe("text");
  if (result.kind !== "text") throw new Error("unreachable");
  expect(result.text).toContain("3-step refactor confirmed");
});

test("exit_plan_mode permission is auto", () => {
  expect(exitPlanMode.permission).toBe("auto");
});

test("exit_plan_mode does not throw when invoked from plan mode", async () => {
  const result = await exitPlanMode.call({}, makeCtx(cwd, { mode: "plan" }));
  expect(result.kind).toBe("text");
});
