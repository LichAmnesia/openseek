import { test, expect, beforeEach, afterEach } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { syncSettings } from "../src/sync.ts";

let dir: string;
let cachePath: string;

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "openseek-sync-"));
  cachePath = join(dir, "sync-cache.json");
});

afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
});

function mockFetch(handler: (req: Request) => Response | Promise<Response>): typeof fetch {
  return ((input: Request | URL | string, init?: RequestInit) => {
    const req = input instanceof Request ? input : new Request(String(input), init);
    return Promise.resolve(handler(req));
  }) as unknown as typeof fetch;
}

test("syncSettings ok=true on 200, writes cache, returns server settings", async () => {
  const f = mockFetch(
    () =>
      new Response(JSON.stringify({ settings: { theme: "dark", remote: true } }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }),
  );
  const out = await syncSettings({ theme: "light" }, { apiKey: "sk", fetch: f, cachePath });
  expect(out.ok).toBe(true);
  expect(out.fromServer).toBe(true);
  expect(out.settings).toEqual({ theme: "dark", remote: true });
  // cache present?
  const cached = await Bun.file(cachePath).text();
  expect(cached).toContain('"theme": "dark"');
});

test("syncSettings server 500 → ok=false; falls through to cache", async () => {
  // pre-populate cache
  await Bun.write(
    cachePath,
    JSON.stringify({ syncedAt: "2026-01-01T00:00:00Z", settings: { hello: "world" } }),
  );
  const f = mockFetch(() => new Response("boom", { status: 500 }));
  const out = await syncSettings({ x: 1 }, { apiKey: "sk", fetch: f, cachePath });
  expect(out.ok).toBe(false);
  expect(out.fromServer).toBe(false);
  expect(out.settings).toEqual({ hello: "world" });
});

test("syncSettings network throw → ok=false + cache miss returns input", async () => {
  const f = (() => {
    throw new Error("nope");
  }) as unknown as typeof fetch;
  const out = await syncSettings(
    { theme: "neon" },
    { apiKey: "sk", fetch: f, cachePath },
  );
  expect(out.ok).toBe(false);
  expect(out.settings).toEqual({ theme: "neon" });
});

test("syncSettings empty apiKey skips network and returns cache when present", async () => {
  await Bun.write(
    cachePath,
    JSON.stringify({ syncedAt: "now", settings: { keyless: true } }),
  );
  let called = false;
  const f = mockFetch(() => {
    called = true;
    return new Response("nope", { status: 200 });
  });
  const out = await syncSettings({ theme: "x" }, { apiKey: "", fetch: f, cachePath });
  expect(called).toBe(false);
  expect(out.ok).toBe(false);
  expect(out.settings).toEqual({ keyless: true });
});
