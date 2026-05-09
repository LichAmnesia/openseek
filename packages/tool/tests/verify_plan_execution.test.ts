import { expect, test } from "bun:test";
import verifyPlanExecution from "../src/tools/verify_plan_execution.ts";
import { makeCtx, makeTmpDir } from "./helpers.ts";

test("verify_plan_execution acks every step in stub mode", async () => {
  const result = await verifyPlanExecution.call(
    { steps: ["scaffold", "implement", "test"] },
    makeCtx(makeTmpDir("x")),
  );
  expect(result.kind).toBe("text");
  if (result.kind !== "text") throw new Error("unreachable");
  expect(result.text).toContain("3 step(s) verified");
  expect(result.text).toContain("scaffold");
  expect(result.text).toContain("test");
});

test("verify_plan_execution schema rejects empty steps array", () => {
  const parsed = verifyPlanExecution.inputSchema.safeParse({ steps: [] });
  expect(parsed.success).toBe(false);
});
