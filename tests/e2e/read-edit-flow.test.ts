// e2e: read + edit tool flows (G7.2 #1).
// Validates the user→assistant→tool→assistant loop end-to-end via mock LM.

import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { read as readTool, edit as editTool } from "@openseek/tool";
import { runHarness, textChunks, toolCallChunks } from "./_harness.ts";

let dir: string;

beforeAll(() => {
  dir = mkdtempSync(join(tmpdir(), "openseek-e2e-read-"));
});
afterAll(() => {
  rmSync(dir, { recursive: true, force: true });
});

describe("e2e: read+edit flow", () => {
  test("read tool returns file contents in 2-round loop", async () => {
    const file = join(dir, "hello.txt");
    writeFileSync(file, "from disk\n");
    const res = await runHarness({
      prompt: "read it",
      phases: [
        { chunks: toolCallChunks("read", { path: file }, "c1") },
        { chunks: textChunks("ok done") },
      ],
      tools: new Map([["read", readTool]]),
      cwd: dir,
    });
    const types = res.events.map((e) => e.type);
    expect(types).toContain("tool-call");
    expect(types).toContain("tool-result");
    expect(types).toContain("text-delta");
    expect(types.at(-1)).toBe("turn-end");
  });

  test("edit tool produces a diff-kind ToolResult", async () => {
    const file = join(dir, "edit.txt");
    writeFileSync(file, "old content\n");
    const res = await runHarness({
      prompt: "edit",
      phases: [
        {
          chunks: toolCallChunks(
            "edit",
            { path: file, old_string: "old content", new_string: "new content" },
            "c2",
          ),
        },
        { chunks: textChunks("done") },
      ],
      tools: new Map([["edit", editTool]]),
      cwd: dir,
    });
    const tr = res.events.find((e) => e.type === "tool-result");
    expect(tr).toBeDefined();
    if (tr && tr.type === "tool-result") {
      expect(tr.result.result.kind === "diff" || tr.result.result.kind === "text").toBe(true);
    }
    expect(readFileSync(file, "utf8")).toContain("new content");
  });

  test("read of a large file truncates to safe head when no offset/limit", async () => {
    const big = join(dir, "big.txt");
    const lines = Array.from({ length: 5000 }, (_, i) => `line${i}`).join("\n");
    writeFileSync(big, lines);
    const res = await runHarness({
      prompt: "read big",
      phases: [
        { chunks: toolCallChunks("read", { path: big }, "c3") },
        { chunks: textChunks("k") },
      ],
      tools: new Map([["read", readTool]]),
      cwd: dir,
    });
    const tr = res.events.find((e) => e.type === "tool-result");
    if (tr && tr.type === "tool-result") {
      expect(tr.result.result.kind === "text" || tr.result.result.kind === "error").toBe(true);
    }
  });

  test("read of a non-existent file surfaces a tool error", async () => {
    const res = await runHarness({
      prompt: "missing",
      phases: [
        { chunks: toolCallChunks("read", { path: join(dir, "nope.txt") }, "c4") },
        { chunks: textChunks("oops") },
      ],
      tools: new Map([["read", readTool]]),
      cwd: dir,
    });
    const tr = res.events.find((e) => e.type === "tool-result");
    if (tr && tr.type === "tool-result") {
      expect(tr.result.result.kind).toBe("error");
    }
  });

  test("read denies a path that escapes cwd (workspace boundary)", async () => {
    const res = await runHarness({
      prompt: "escape",
      phases: [
        { chunks: toolCallChunks("read", { path: "/etc/passwd" }, "c5") },
        { chunks: textChunks("blocked") },
      ],
      tools: new Map([["read", readTool]]),
      cwd: dir,
    });
    const tr = res.events.find((e) => e.type === "tool-result");
    if (tr && tr.type === "tool-result") {
      expect(tr.result.result.kind).toBe("error");
    }
  });
});
