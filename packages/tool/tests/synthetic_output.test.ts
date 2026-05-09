import { expect, test } from "bun:test";
import syntheticOutput from "../src/tools/synthetic_output.ts";
import { makeCtx, makeTmpDir } from "./helpers.ts";

test("synthetic_output echoes the input verbatim", async () => {
  const result = await syntheticOutput.call(
    { content: "hello\nworld" },
    makeCtx(makeTmpDir("x")),
  );
  expect(result.kind).toBe("text");
  if (result.kind !== "text") throw new Error("unreachable");
  expect(result.text).toBe("hello\nworld");
});

test("synthetic_output handles empty string", async () => {
  const result = await syntheticOutput.call({ content: "" }, makeCtx(makeTmpDir("x")));
  if (result.kind !== "text") throw new Error("unreachable");
  expect(result.text).toBe("");
});
