// microCompact unit tests (SPEC G2.1 #1).

import { describe, expect, test } from "bun:test";
import type { OpenSeekMessage } from "@openseek/provider";
import {
  CLEARED_TOOL_RESULT_MARKER,
  microCompact,
} from "../../src/compact/index.ts";

function toolResultMsg(id: string, body: string): OpenSeekMessage {
  return {
    role: "tool",
    content: [{ type: "tool_result", toolCallId: id, result: body }],
    toolCallId: id,
  };
}

function userMsg(text: string): OpenSeekMessage {
  return { role: "user", content: [{ type: "text", text }] };
}

function assistantMsg(text: string): OpenSeekMessage {
  return { role: "assistant", content: [{ type: "text", text }] };
}

describe("microCompact", () => {
  test("keeps all tool_results when count <= keep limit", () => {
    const messages = [
      toolResultMsg("c1", "alpha"),
      toolResultMsg("c2", "beta"),
      toolResultMsg("c3", "gamma"),
      toolResultMsg("c4", "delta"),
      toolResultMsg("c5", "epsilon"),
    ];
    const out = microCompact({ messages });
    expect(out.dropped).toBe(0);
    expect(out.strategy).toBe("micro");
    for (let i = 0; i < 5; i++) {
      const block = out.messages[i]?.content[0]!;
      expect(block.type).toBe("tool_result");
      if (block.type === "tool_result") expect(block.result).not.toBe(CLEARED_TOOL_RESULT_MARKER);
    }
  });

  test("clears oldest results when count > keep (default 5)", () => {
    const messages = [
      toolResultMsg("c1", "alpha"),
      toolResultMsg("c2", "beta"),
      toolResultMsg("c3", "gamma"),
      toolResultMsg("c4", "delta"),
      toolResultMsg("c5", "epsilon"),
      toolResultMsg("c6", "zeta"),
      toolResultMsg("c7", "eta"),
    ];
    const out = microCompact({ messages });
    // First 2 cleared, last 5 kept verbatim.
    const first = out.messages[0]?.content[0]!;
    const second = out.messages[1]?.content[0]!;
    if (first.type === "tool_result") expect(first.result).toBe(CLEARED_TOOL_RESULT_MARKER);
    if (second.type === "tool_result") expect(second.result).toBe(CLEARED_TOOL_RESULT_MARKER);

    for (let i = 2; i < 7; i++) {
      const blk = out.messages[i]?.content[0]!;
      if (blk.type === "tool_result") expect(blk.result).not.toBe(CLEARED_TOOL_RESULT_MARKER);
    }
  });

  test("no-op when no tool_results present", () => {
    const messages = [userMsg("hi"), assistantMsg("hello"), userMsg("bye")];
    const out = microCompact({ messages });
    expect(out.dropped).toBe(0);
    expect(out.messages).toHaveLength(3);
    expect(out.messages[0]).toBe(messages[0]!); // ref preserved
  });

  test("mixed user/assistant/tool — only tool_result blocks touched", () => {
    const messages: OpenSeekMessage[] = [
      userMsg("question 1"),
      toolResultMsg("c1", "r1"),
      assistantMsg("intermediate"),
      toolResultMsg("c2", "r2"),
      toolResultMsg("c3", "r3"),
      toolResultMsg("c4", "r4"),
      toolResultMsg("c5", "r5"),
      toolResultMsg("c6", "r6"),
      assistantMsg("done"),
    ];
    const out = microCompact({ messages }, { keepRecentToolResults: 2 });
    // Tool results: c1, c2, c3, c4, c5, c6 — keep last 2 (c5, c6), clear first 4.
    const cleared: string[] = [];
    const kept: string[] = [];
    for (const msg of out.messages) {
      for (const blk of msg.content) {
        if (blk.type === "tool_result") {
          if (blk.result === CLEARED_TOOL_RESULT_MARKER) cleared.push(blk.toolCallId);
          else kept.push(blk.toolCallId);
        }
      }
    }
    expect(cleared).toEqual(["c1", "c2", "c3", "c4"]);
    expect(kept).toEqual(["c5", "c6"]);
    // Non-tool messages preserved by reference.
    expect(out.messages[0]).toBe(messages[0]!);
    expect(out.messages[2]).toBe(messages[2]!);
    expect(out.messages[8]).toBe(messages[8]!);
  });

  test("immutable: input messages and content arrays not mutated", () => {
    const original: OpenSeekMessage[] = [
      toolResultMsg("c1", "alpha"),
      toolResultMsg("c2", "beta"),
      toolResultMsg("c3", "gamma"),
    ];
    const snapshot = JSON.parse(JSON.stringify(original));
    microCompact({ messages: original }, { keepRecentToolResults: 1 });
    expect(JSON.parse(JSON.stringify(original))).toEqual(snapshot);
  });
});
