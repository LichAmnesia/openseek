import { afterEach, beforeEach, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import terminalCapture from "../src/tools/terminal_capture.ts";
import { makeCtx, makeTmpDir } from "./helpers.ts";

let fakeHome: string;
let originalHome: string | undefined;

beforeEach(() => {
  fakeHome = mkdtempSync(join(tmpdir(), "tcap-"));
  originalHome = process.env.HOME;
  process.env.HOME = fakeHome;
});

afterEach(() => {
  process.env.HOME = originalHome;
  rmSync(fakeHome, { recursive: true, force: true });
});

function writeLog(name: string, content: string): string {
  const dir = join(fakeHome, ".openseek", "logs");
  mkdirSync(dir, { recursive: true });
  const path = join(dir, `${name}.log`);
  writeFileSync(path, content);
  return path;
}

test("terminal_capture returns hint when no logs exist", async () => {
  const result = await terminalCapture.call({ scope: "last" }, makeCtx(makeTmpDir("tc-")));
  expect(result.kind).toBe("text");
  if (result.kind !== "text") throw new Error("unreachable");
  expect(result.text).toContain("no logs");
});

test("terminal_capture tails default N lines (scope=last)", async () => {
  const lines = Array.from({ length: 50 }, (_, i) => `line ${i}`);
  writeLog("sess", lines.join("\n"));
  const result = await terminalCapture.call(
    { scope: "last", lines: 5 },
    makeCtx(makeTmpDir("tc-")),
  );
  if (result.kind !== "text") throw new Error("unreachable");
  expect(result.text).toContain("line 49");
  expect(result.text).toContain("line 45");
  expect(result.text).not.toContain("line 40");
});

test("terminal_capture honours sessionId override", async () => {
  writeLog("default", "x");
  writeLog("custom", "this is the custom one\nsecond line");
  const result = await terminalCapture.call(
    { sessionId: "custom" },
    makeCtx(makeTmpDir("tc-")),
  );
  if (result.kind !== "text") throw new Error("unreachable");
  expect(result.text).toContain("the custom one");
});

test("terminal_capture errors on missing sessionId", async () => {
  writeLog("a", "x");
  const result = await terminalCapture.call(
    { sessionId: "ghost" },
    makeCtx(makeTmpDir("tc-")),
  );
  if (result.kind !== "text") throw new Error("unreachable");
  expect(result.text).toContain("no log for session=ghost");
});

test("terminal_capture scope=session returns whole log", async () => {
  writeLog("sess2", "alpha\nbeta\ngamma");
  const result = await terminalCapture.call(
    { scope: "session", sessionId: "sess2" },
    makeCtx(makeTmpDir("tc-")),
  );
  if (result.kind !== "text") throw new Error("unreachable");
  expect(result.text).toContain("alpha");
  expect(result.text).toContain("gamma");
  expect(result.text).toContain("scope=session");
});
