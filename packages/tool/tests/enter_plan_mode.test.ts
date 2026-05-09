import { afterEach, beforeEach, expect, test } from "bun:test";
import enterPlanMode from "../src/tools/enter_plan_mode.ts";
import { cleanupTmpDir, makeCtx, makeTmpDir } from "./helpers.ts";

let cwd: string;

beforeEach(() => {
  cwd = makeTmpDir("openseek-enter-plan-");
});

afterEach(() => {
  cleanupTmpDir(cwd);
});

test("enter_plan_mode emits a mode-signal ack", async () => {
  const result = await enterPlanMode.call({}, makeCtx(cwd));
  expect(result.kind).toBe("text");
  if (result.kind !== "text") throw new Error("unreachable");
  expect(result.text).toContain("[mode-signal]");
  expect(result.text).toContain("enter_plan_mode acknowledged");
});

test("enter_plan_mode echoes the reason when provided", async () => {
  const result = await enterPlanMode.call(
    { reason: "user requested plan-only" },
    makeCtx(cwd),
  );
  expect(result.kind).toBe("text");
  if (result.kind !== "text") throw new Error("unreachable");
  expect(result.text).toContain("reason: user requested plan-only");
});

test("enter_plan_mode permission is auto", () => {
  expect(enterPlanMode.permission).toBe("auto");
});

test("enter_plan_mode is callable from any mode", async () => {
  for (const mode of ["plan", "agent", "yolo"] as const) {
    const result = await enterPlanMode.call({}, makeCtx(cwd, { mode }));
    expect(result.kind).toBe("text");
  }
});
