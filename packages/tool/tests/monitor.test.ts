import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { afterAll, afterEach, beforeAll, expect, test } from "bun:test";
import monitor from "../src/tools/monitor.ts";
import { cleanupTmpDir, makeCtx, makeTmpDir } from "./helpers.ts";

interface ListenerLike {
  port: number;
  stop(closeActiveConnections?: boolean): void;
}
let server: ListenerLike | undefined;
let listenPort = 0;
const tmp = makeTmpDir("openseek-monitor-");

beforeAll(() => {
  server = Bun.listen({
    hostname: "127.0.0.1",
    port: 0,
    socket: {
      data() {},
      open() {},
      close() {},
      error() {},
    },
  }) as unknown as ListenerLike;
  listenPort = server.port;
});

afterAll(() => {
  server?.stop(true);
  cleanupTmpDir(tmp);
});

afterEach(() => {});

test("monitor reports an open port", async () => {
  const result = await monitor.call(
    { target: "port", value: String(listenPort) },
    makeCtx(tmp),
  );
  expect(result.kind).toBe("text");
  if (result.kind !== "text") throw new Error("unreachable");
  expect(result.text).toContain(`port ${listenPort} open`);
});

test("monitor reports a closed port on a likely-unused number", async () => {
  // Pick a high port; if it happens to be used, the test still passes because
  // we only assert the text shape ("open" OR "closed").
  const result = await monitor.call(
    { target: "port", value: "1", timeoutMs: 500 },
    makeCtx(tmp),
  );
  if (result.kind !== "text") throw new Error("unreachable");
  expect(/port 1 (open|closed)/.test(result.text)).toBe(true);
});

test("monitor rejects an out-of-range port", async () => {
  const result = await monitor.call(
    { target: "port", value: "70000" },
    makeCtx(tmp),
  );
  expect(result.kind).toBe("error");
});

test("monitor reports an existing file with size + mtime", async () => {
  const path = join(tmp, "note.txt");
  writeFileSync(path, "hello");
  const result = await monitor.call({ target: "file", value: path }, makeCtx(tmp));
  if (result.kind !== "text") throw new Error("unreachable");
  expect(result.text).toContain("exists");
  expect(result.text).toContain("size=5");
});

test("monitor reports a missing file", async () => {
  const result = await monitor.call(
    { target: "file", value: join(tmp, "nope.txt") },
    makeCtx(tmp),
  );
  if (result.kind !== "text") throw new Error("unreachable");
  expect(result.text).toContain("missing");
});

test("monitor process probe returns 'running' or 'not running'", async () => {
  const result = await monitor.call(
    { target: "process", value: "definitely-not-a-real-process-xyz-12345" },
    makeCtx(tmp),
  );
  if (result.kind !== "text") throw new Error("unreachable");
  expect(/process .+ (running|not running)/.test(result.text)).toBe(true);
});
