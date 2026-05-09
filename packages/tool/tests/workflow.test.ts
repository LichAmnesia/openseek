import { expect, test } from "bun:test";
import workflow from "../src/tools/workflow.ts";
import { makeCtx, makeTmpDir } from "./helpers.ts";

test("workflow registers a named multi-step plan", async () => {
  const result = await workflow.call(
    { name: "release-cut", steps: ["bump", "tag", "publish"] },
    makeCtx(makeTmpDir("x")),
  );
  expect(result.kind).toBe("text");
  if (result.kind !== "text") throw new Error("unreachable");
  expect(result.text).toContain("release-cut");
  expect(result.text).toContain("3 step(s)");
});

test("workflow schema rejects empty steps", () => {
  const parsed = workflow.inputSchema.safeParse({ name: "x", steps: [] });
  expect(parsed.success).toBe(false);
});
