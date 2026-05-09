import { expect, test } from "bun:test";
import toolSearch from "../src/tools/tool_search.ts";
import { makeCtx, makeTmpDir } from "./helpers.ts";

test("tool_search finds an exact tool by name substring", async () => {
  const result = await toolSearch.call({ query: "task_get" }, makeCtx(makeTmpDir("x")));
  expect(result.kind).toBe("text");
  if (result.kind !== "text") throw new Error("unreachable");
  expect(result.text).toContain("task_get");
  expect(result.text).toContain("match");
});

test("tool_search returns no-match marker on garbage query", async () => {
  const result = await toolSearch.call(
    { query: "zzz-no-such-tool-zzz" },
    makeCtx(makeTmpDir("x")),
  );
  if (result.kind !== "text") throw new Error("unreachable");
  expect(result.text).toContain("no tools match");
});

test("tool_search ranks name matches above description matches", async () => {
  const result = await toolSearch.call({ query: "config", limit: 5 }, makeCtx(makeTmpDir("x")));
  if (result.kind !== "text") throw new Error("unreachable");
  // The first match should be the `config` tool (exact name match)
  const firstMatchLine = result.text.split("\n").find((l) => l.startsWith("  - "));
  expect(firstMatchLine).toBeDefined();
  expect(firstMatchLine).toContain("config:");
});
