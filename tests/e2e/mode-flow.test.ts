// e2e: mode-flow (G7.2 #4).
// Plan / Agent / YOLO mode-gating semantics.

import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, test } from "bun:test";
import type { AnyTool } from "@openseek/tool";
import { read as readTool, edit as editTool, bash as bashTool } from "@openseek/tool";
import { filterToolsByMode } from "@openseek/session";
import { runHarness, textChunks, toolCallChunks } from "./_harness.ts";

describe("e2e: mode flow", () => {
  test("plan mode strips deny-in-plan tools (edit/bash) from registry", () => {
    const all = new Map<string, AnyTool>([
      ["read", readTool as AnyTool],
      ["edit", editTool as AnyTool],
      ["bash", bashTool as AnyTool],
    ]);
    const planned = filterToolsByMode(all, "plan");
    expect(planned.has("read")).toBe(true);
    expect(planned.has("edit")).toBe(false);
    expect(planned.has("bash")).toBe(false);
  });

  test("agent mode runs an edit tool to completion (deny-in-plan still allowed)", async () => {
    const dir = mkdtempSync(join(tmpdir(), "openseek-e2e-mode-"));
    try {
      const file = join(dir, "x.txt");
      writeFileSync(file, "hello\n");
      const res = await runHarness({
        prompt: "edit it",
        mode: "agent",
        phases: [
          {
            chunks: toolCallChunks(
              "edit",
              { path: file, old_string: "hello", new_string: "world" },
              "m1",
            ),
          },
          { chunks: textChunks("done") },
        ],
        tools: filterToolsByMode(
          new Map([["edit", editTool]]),
          "agent",
        ),
        cwd: dir,
      });
      const types = res.events.map((e) => e.type);
      expect(types).toContain("tool-result");
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  test("yolo mode keeps every tool available — auto-approve is a UI concern, not gate-level", () => {
    const all = new Map<string, AnyTool>([
      ["read", readTool as AnyTool],
      ["edit", editTool as AnyTool],
      ["bash", bashTool as AnyTool],
    ]);
    const yolo = filterToolsByMode(all, "yolo");
    expect(yolo.size).toBe(3);
    // Different reference (fresh Map) — confirms no shared mutation surface.
    expect(yolo).not.toBe(all);
  });
});
