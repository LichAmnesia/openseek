import { afterEach, beforeEach, expect, test } from "bun:test";
import reviewArtifact from "../src/tools/review_artifact.ts";
import { cleanupTmpDir, makeCtx, makeTmpDir } from "./helpers.ts";

let cwd: string;

beforeEach(() => {
  cwd = makeTmpDir("openseek-review-artifact-");
});

afterEach(() => {
  cleanupTmpDir(cwd);
});

test("review_artifact emits review marker for in-workspace path", async () => {
  const result = await reviewArtifact.call({ path: "src/feature.ts" }, makeCtx(cwd));
  expect(result.kind).toBe("text");
  if (result.kind !== "text") throw new Error("unreachable");
  expect(result.text).toContain("src/feature.ts");
  expect(result.text).toContain("[stub]");
});

test("review_artifact rejects path that escapes workspace", async () => {
  const result = await reviewArtifact.call({ path: "../../../etc/secrets" }, makeCtx(cwd));
  expect(result.kind).toBe("error");
});

test("review_artifact echoes rubric when provided", async () => {
  const result = await reviewArtifact.call(
    { path: "diff.patch", rubric: "no breaking API change" },
    makeCtx(cwd),
  );
  if (result.kind !== "text") throw new Error("unreachable");
  expect(result.text).toContain("no breaking API change");
});
