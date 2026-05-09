import { expect, test } from "bun:test";
import brief from "../src/tools/brief.ts";
import { makeCtx, makeTmpDir } from "./helpers.ts";

test("brief returns not-yet-implemented marker with default format", async () => {
  const result = await brief.call({ format: "markdown" }, makeCtx(makeTmpDir("x")));
  expect(result.kind).toBe("text");
  if (result.kind !== "text") throw new Error("unreachable");
  expect(result.text).toContain("not yet implemented");
  expect(result.text).toContain("format=markdown");
});

test("brief echoes optional topic in marker", async () => {
  const result = await brief.call(
    { format: "json", topic: "deploy issues" },
    makeCtx(makeTmpDir("x")),
  );
  if (result.kind !== "text") throw new Error("unreachable");
  expect(result.text).toContain("topic=deploy issues");
});
