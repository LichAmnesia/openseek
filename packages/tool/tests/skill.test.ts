import { expect, test } from "bun:test";
import skill from "../src/tools/skill.ts";
import { makeCtx, makeTmpDir } from "./helpers.ts";

test("skill acks invocation with arg keys", async () => {
  const result = await skill.call(
    { name: "deploy-cineai", args: { branch: "main", region: "us" } },
    makeCtx(makeTmpDir("x")),
  );
  expect(result.kind).toBe("text");
  if (result.kind !== "text") throw new Error("unreachable");
  expect(result.text).toContain("deploy-cineai");
  expect(result.text).toContain("branch");
  expect(result.text).toContain("region");
});

test("skill prints (none) for args when omitted", async () => {
  const result = await skill.call({ name: "lint" }, makeCtx(makeTmpDir("x")));
  if (result.kind !== "text") throw new Error("unreachable");
  expect(result.text).toContain("args=(none)");
});
