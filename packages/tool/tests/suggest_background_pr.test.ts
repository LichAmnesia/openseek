import { expect, test } from "bun:test";
import suggestBackgroundPr from "../src/tools/suggest_background_pr.ts";
import { makeCtx, makeTmpDir } from "./helpers.ts";

test("suggest_background_pr returns proposal with title and body", async () => {
  const result = await suggestBackgroundPr.call(
    {
      title: "feat(tool): add 37 stub tools",
      body: "first line of body\nsecond line",
      branch: "feat/tools-37",
    },
    makeCtx(makeTmpDir("x")),
  );
  expect(result.kind).toBe("text");
  if (result.kind !== "text") throw new Error("unreachable");
  expect(result.text).toContain("not yet implemented");
  expect(result.text).toContain("feat(tool)");
  expect(result.text).toContain("feat/tools-37");
  expect(result.text).toContain("first line of body");
});

test("suggest_background_pr defaults to current-branch placeholder", async () => {
  const result = await suggestBackgroundPr.call(
    { title: "fix: x", body: "y" },
    makeCtx(makeTmpDir("x")),
  );
  if (result.kind !== "text") throw new Error("unreachable");
  expect(result.text).toContain("(current branch)");
});
