import { afterEach, beforeEach, expect, test } from "bun:test";
import webFetch from "../src/tools/web_fetch.ts";
import { cleanupTmpDir, makeCtx, makeTmpDir } from "./helpers.ts";

let cwd: string;
let originalFetch: typeof fetch;

beforeEach(() => {
  cwd = makeTmpDir("openseek-web-fetch-");
  originalFetch = globalThis.fetch;
});

afterEach(() => {
  globalThis.fetch = originalFetch;
  cleanupTmpDir(cwd);
});

function mockHtml(html: string): void {
  globalThis.fetch = (async () =>
    new Response(html, {
      status: 200,
      headers: { "content-type": "text/html; charset=utf-8" },
    })) as unknown as typeof fetch;
}

test("web_fetch converts headings, paragraphs, and lists to markdown", async () => {
  mockHtml(
    `<html><head><title>x</title></head><body>
      <h1>Title</h1>
      <p>Hello <strong>world</strong>.</p>
      <ul><li>one</li><li>two</li></ul>
      <a href="https://example.com">link</a>
    </body></html>`,
  );
  const result = await webFetch.call(
    { url: "https://example.test/page" },
    makeCtx(cwd),
  );
  expect(result.kind).toBe("text");
  if (result.kind !== "text") throw new Error("unreachable");
  expect(result.text).toContain("# https://example.test/page");
  expect(result.text).toContain("# Title");
  expect(result.text).toContain("Hello world.");
  expect(result.text).toContain("- one");
  expect(result.text).toContain("- two");
  expect(result.text).toContain("[link](https://example.com)");
});

test("web_fetch strips script, style, and nav blocks", async () => {
  mockHtml(
    `<html><body>
      <nav>nav-junk</nav>
      <script>var a = 1;</script>
      <style>body{color:red}</style>
      <p>kept</p>
    </body></html>`,
  );
  const result = await webFetch.call(
    { url: "https://example.test/strip" },
    makeCtx(cwd),
  );
  expect(result.kind).toBe("text");
  if (result.kind !== "text") throw new Error("unreachable");
  expect(result.text).toContain("kept");
  expect(result.text).not.toContain("nav-junk");
  expect(result.text).not.toContain("var a = 1");
  expect(result.text).not.toContain("color:red");
});

test("web_fetch returns non-html content verbatim", async () => {
  globalThis.fetch = (async () =>
    new Response('{"hello":"world"}', {
      status: 200,
      headers: { "content-type": "application/json" },
    })) as unknown as typeof fetch;
  const result = await webFetch.call(
    { url: "https://example.test/data.json" },
    makeCtx(cwd),
  );
  expect(result.kind).toBe("text");
  if (result.kind !== "text") throw new Error("unreachable");
  expect(result.text).toContain('{"hello":"world"}');
  expect(result.text).toContain("application/json");
});

test("web_fetch reports HTTP errors", async () => {
  globalThis.fetch = (async () =>
    new Response("nope", {
      status: 503,
      statusText: "Service Unavailable",
    })) as unknown as typeof fetch;
  const result = await webFetch.call(
    { url: "https://example.test/err" },
    makeCtx(cwd),
  );
  expect(result.kind).toBe("error");
  if (result.kind !== "error") throw new Error("unreachable");
  expect(result.message).toContain("HTTP 503");
});

test("web_fetch reports network failures", async () => {
  globalThis.fetch = (async () => {
    throw new TypeError("network down");
  }) as unknown as typeof fetch;
  const result = await webFetch.call(
    { url: "https://example.test/down" },
    makeCtx(cwd),
  );
  expect(result.kind).toBe("error");
  if (result.kind !== "error") throw new Error("unreachable");
  expect(result.message).toContain("fetch failed");
});
