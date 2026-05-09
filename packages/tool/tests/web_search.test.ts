import { afterEach, beforeEach, expect, test } from "bun:test";
import webSearch, { parseDuckLite, setWebSearchFetch } from "../src/tools/web_search.ts";
import { cleanupTmpDir, makeCtx, makeTmpDir } from "./helpers.ts";

let cwd: string;

beforeEach(() => {
  cwd = makeTmpDir("openseek-web-search-");
});

afterEach(() => {
  cleanupTmpDir(cwd);
  setWebSearchFetch(undefined);
});

const SAMPLE_HTML = `
<html><body>
<table>
  <tr><td>1.</td>
    <td><a class="result-link" href="https://example.com/a">First Result</a></td>
  </tr>
  <tr><td></td>
    <td class="result-snippet">first snippet text</td>
  </tr>
  <tr><td>2.</td>
    <td><a class="result-link" href="https://example.com/b">Second Result</a></td>
  </tr>
  <tr><td></td>
    <td class="result-snippet">second snippet text</td>
  </tr>
</table>
</body></html>
`;

test("parseDuckLite extracts links + snippets", () => {
  const results = parseDuckLite(SAMPLE_HTML, 5);
  expect(results.length).toBe(2);
  expect(results[0]).toMatchObject({
    url: "https://example.com/a",
    title: "First Result",
    snippet: "first snippet text",
  });
});

test("web_search calls fetch and renders parsed results", async () => {
  let calledUrl = "";
  setWebSearchFetch((async (input: unknown) => {
    calledUrl = String(input);
    return new Response(SAMPLE_HTML, { status: 200 });
  }) as unknown as typeof fetch);
  const result = await webSearch.call({ query: "openseek" }, makeCtx(cwd));
  expect(calledUrl).toContain("lite.duckduckgo.com");
  expect(calledUrl).toContain("openseek");
  expect(result.kind).toBe("text");
  if (result.kind !== "text") throw new Error("unreachable");
  expect(result.text).toContain("# query: openseek");
  expect(result.text).toContain("First Result");
  expect(result.text).toContain("https://example.com/a");
  expect(result.text).toContain("first snippet text");
});

test("web_search returns error on non-2xx", async () => {
  setWebSearchFetch((async () =>
    new Response("nope", { status: 503, statusText: "down" })) as unknown as typeof fetch);
  const result = await webSearch.call({ query: "x" }, makeCtx(cwd));
  expect(result.kind).toBe("error");
  if (result.kind !== "error") throw new Error("unreachable");
  expect(result.message).toContain("503");
});

test("web_search honours limit", async () => {
  setWebSearchFetch((async () =>
    new Response(SAMPLE_HTML, { status: 200 })) as unknown as typeof fetch);
  const result = await webSearch.call({ query: "x", limit: 1 }, makeCtx(cwd));
  if (result.kind !== "text") throw new Error("unreachable");
  expect(result.text).toContain("First Result");
  expect(result.text).not.toContain("Second Result");
});

test("web_search rejects empty query at the schema layer", () => {
  const parsed = webSearch.inputSchema.safeParse({ query: "" });
  expect(parsed.success).toBe(false);
});
