import { afterEach, beforeEach, expect, test } from "bun:test";
import webSearch, { parseDuckLite, setWebSearchFetch } from "../src/tools/web_search.ts";
import { cleanupTmpDir, makeCtx, makeTmpDir } from "./helpers.ts";

let cwd: string;
let savedTavilyKey: string | undefined;

beforeEach(() => {
  cwd = makeTmpDir("openseek-web-search-");
  // Pin the backend: the dev machine exports TAVILY_API_KEY, which would
  // silently flip these DDG-path tests onto the Tavily branch.
  savedTavilyKey = process.env.TAVILY_API_KEY;
  delete process.env.TAVILY_API_KEY;
});

afterEach(() => {
  cleanupTmpDir(cwd);
  setWebSearchFetch(undefined);
  if (savedTavilyKey === undefined) delete process.env.TAVILY_API_KEY;
  else process.env.TAVILY_API_KEY = savedTavilyKey;
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

// ---------- Tavily backend ----------

const TAVILY_JSON = JSON.stringify({
  results: [
    { url: "https://nomac.app", title: "NoMac", content: "Ship iOS apps without a Mac" },
    { url: "https://osaurus.ai", title: "Osaurus", content: "Local open-source agents" },
  ],
});

test("web_search uses Tavily when TAVILY_API_KEY is set", async () => {
  process.env.TAVILY_API_KEY = "tvly-test-key";
  let calledUrl = "";
  let authHeader = "";
  let postBody = "";
  setWebSearchFetch((async (input: unknown, init?: RequestInit) => {
    calledUrl = String(input);
    authHeader = String((init?.headers as Record<string, string>)?.authorization ?? "");
    postBody = String(init?.body ?? "");
    return new Response(TAVILY_JSON, { status: 200 });
  }) as unknown as typeof fetch);
  const result = await webSearch.call({ query: "nomac ios", limit: 2 }, makeCtx(cwd));
  expect(calledUrl).toContain("api.tavily.com");
  expect(authHeader).toBe("Bearer tvly-test-key");
  expect(postBody).toContain('"nomac ios"');
  if (result.kind !== "text") throw new Error("unreachable");
  expect(result.text).toContain("# backend: tavily");
  expect(result.text).toContain("NoMac");
  expect(result.text).toContain("https://osaurus.ai");
});

test("web_search falls back to DDG when Tavily errors", async () => {
  process.env.TAVILY_API_KEY = "tvly-test-key";
  const urls: string[] = [];
  setWebSearchFetch((async (input: unknown) => {
    urls.push(String(input));
    if (String(input).includes("tavily")) {
      return new Response("quota", { status: 429, statusText: "Too Many" });
    }
    return new Response(SAMPLE_HTML, { status: 200 });
  }) as unknown as typeof fetch);
  const result = await webSearch.call({ query: "x" }, makeCtx(cwd));
  expect(urls.some((u) => u.includes("tavily"))).toBe(true);
  expect(urls.some((u) => u.includes("duckduckgo"))).toBe(true);
  if (result.kind !== "text") throw new Error("unreachable");
  expect(result.text).toContain("# backend: duckduckgo (tavily fallback)");
  expect(result.text).toContain("First Result");
});
