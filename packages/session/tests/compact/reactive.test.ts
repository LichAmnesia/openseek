// reactiveCompact unit tests (SPEC G2.1 #3).

import { describe, expect, test } from "bun:test";
import type { OpenSeekMessage } from "@openseek/provider";
import {
  CLEARED_TOOL_RESULT_MARKER,
  reactiveCompact,
  shouldReactiveCompact,
} from "../../src/compact/index.ts";
import type { UsageSnapshot } from "../../src/types.ts";

function tr(id: string): OpenSeekMessage {
  return {
    role: "tool",
    content: [{ type: "tool_result", toolCallId: id, result: `result-${id}` }],
    toolCallId: id,
  };
}

describe("reactiveCompact", () => {
  test("trigger fires when last 3 turns show cache miss + creation", () => {
    const history: UsageSnapshot[] = [
      { totalIn: 100, totalOut: 10, cacheRead: 50, cacheCreation: 0 },
      { totalIn: 100, totalOut: 10, cacheRead: 0, cacheCreation: 50 },
      { totalIn: 100, totalOut: 10, cacheRead: 0, cacheCreation: 60 },
      { totalIn: 100, totalOut: 10, cacheRead: 0, cacheCreation: 70 },
    ];
    expect(shouldReactiveCompact(history)).toBe(true);
  });

  test("trigger does NOT fire when cache_read appears in tail", () => {
    const history: UsageSnapshot[] = [
      { totalIn: 100, totalOut: 10, cacheRead: 0, cacheCreation: 50 },
      { totalIn: 100, totalOut: 10, cacheRead: 30, cacheCreation: 20 }, // cache hit
      { totalIn: 100, totalOut: 10, cacheRead: 0, cacheCreation: 40 },
    ];
    expect(shouldReactiveCompact(history)).toBe(false);
    // Also no fire when history is too short.
    expect(shouldReactiveCompact([])).toBe(false);
    expect(shouldReactiveCompact(history.slice(0, 2))).toBe(false);
  });

  test("keeps only 2 most-recent tool_results by default", () => {
    const messages = [tr("a"), tr("b"), tr("c"), tr("d"), tr("e")];
    const out = reactiveCompact({ messages }, { history: [] });
    expect(out.strategy).toBe("reactive");
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
    expect(cleared).toEqual(["a", "b", "c"]);
    expect(kept).toEqual(["d", "e"]);
  });
});
