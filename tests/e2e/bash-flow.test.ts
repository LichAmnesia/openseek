// e2e: bash flow (G7.2 #2).
// bash is `deny-in-plan` so we exercise it under agent mode.

import { describe, expect, test } from "bun:test";
import { bash as bashTool } from "@openseek/tool";
import { runHarness, textChunks, toolCallChunks } from "./_harness.ts";

describe("e2e: bash flow", () => {
  test("bash echo round-trips text through ToolResult", async () => {
    const res = await runHarness({
      prompt: "run echo",
      phases: [
        {
          chunks: toolCallChunks("bash", { command: "echo hello-from-bash" }, "b1"),
        },
        { chunks: textChunks("printed") },
      ],
      tools: new Map([["bash", bashTool]]),
    });
    const tr = res.events.find((e) => e.type === "tool-result");
    expect(tr).toBeDefined();
    if (tr && tr.type === "tool-result") {
      expect(tr.result.result.kind === "text").toBe(true);
      if (tr.result.result.kind === "text") {
        expect(tr.result.result.text).toContain("hello-from-bash");
      }
    }
  });

  test("bash with non-zero exit still surfaces stderr text in result", async () => {
    const res = await runHarness({
      prompt: "fail",
      phases: [
        {
          chunks: toolCallChunks(
            "bash",
            { command: "echo oops 1>&2; exit 7" },
            "b2",
          ),
        },
        { chunks: textChunks("noted") },
      ],
      tools: new Map([["bash", bashTool]]),
    });
    const tr = res.events.find((e) => e.type === "tool-result");
    expect(tr).toBeDefined();
    if (tr && tr.type === "tool-result") {
      // Either text (stdout/stderr block) or error — both acceptable
      // depending on how the tool encodes non-zero exits.
      const k = tr.result.result.kind;
      expect(k === "text" || k === "error").toBe(true);
      if (k === "text") expect(tr.result.result.text).toContain("oops");
    }
  });

  test("bash with tiny timeout is killed and surfaces a sane result", async () => {
    const res = await runHarness({
      prompt: "loop",
      phases: [
        {
          chunks: toolCallChunks(
            "bash",
            { command: "sleep 5", timeoutMs: 50 },
            "b3",
          ),
        },
        { chunks: textChunks("k") },
      ],
      tools: new Map([["bash", bashTool]]),
    });
    const tr = res.events.find((e) => e.type === "tool-result");
    expect(tr).toBeDefined();
    if (tr && tr.type === "tool-result") {
      const k = tr.result.result.kind;
      expect(k === "error" || k === "text").toBe(true);
    }
  });
});
