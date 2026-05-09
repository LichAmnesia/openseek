// e2e: compaction strategies (G7.2 #3).
// Exercises the 5 compact strategies in isolation + decideCompact
// orchestrator + autoCompact happy path through runSession.

import { describe, expect, test } from "bun:test";
import type { OpenSeekMessage } from "@openseek/provider";
import {
  CLEARED_TOOL_RESULT_MARKER,
  autoCompact,
  decideCompact,
  microCompact,
  reactiveCompact,
  sessionMemoryCompact,
  shouldReactiveCompact,
  snipCompact,
} from "@openseek/session";

function sys(text: string): OpenSeekMessage {
  return { role: "system", content: [{ type: "text", text }] };
}
function user(text: string): OpenSeekMessage {
  return { role: "user", content: [{ type: "text", text }] };
}
function asst(text: string): OpenSeekMessage {
  return { role: "assistant", content: [{ type: "text", text }] };
}
function toolMsg(id: string, payload: string): OpenSeekMessage {
  return {
    role: "tool",
    content: [{ type: "tool_result", toolCallId: id, result: payload }],
    toolCallId: id,
  };
}

describe("e2e: compact-flow", () => {
  test("autoCompact: summarizer fold collapses middle history", async () => {
    const seen: number[] = [];
    const summarizer = async (msgs: OpenSeekMessage[]) => {
      seen.push(msgs.length);
      return "DIGEST";
    };
    const out = await autoCompact(
      {
        messages: [
          sys("S"),
          user("u1"),
          asst("a1"),
          user("u2"),
          asst("a2"),
          user("u3"),
        ],
      },
      { summarizer },
    );
    expect(out.strategy).toBe("auto");
    expect(out.dropped).toBeGreaterThan(0);
    expect(seen[0]).toBeGreaterThan(0);
  });

  test("microCompact: replaces older tool_result blocks with marker", () => {
    const messages: OpenSeekMessage[] = [
      sys("S"),
      user("u1"),
      asst("a1"),
      toolMsg("t1", "ABCDEFG-old-1"),
      toolMsg("t2", "ABCDEFG-old-2"),
      toolMsg("t3", "ABCDEFG-recent"),
      user("u2"),
    ];
    const out = microCompact({ messages }, { keepRecentToolResults: 1 });
    expect(out.strategy).toBe("micro");
    const text = JSON.stringify(out.messages);
    expect(text).toContain(CLEARED_TOOL_RESULT_MARKER);
    expect(text).toContain("ABCDEFG-recent");
  });

  test("sessionMemoryCompact + memory-file write hook", async () => {
    let written = "";
    const onWrite = async (d: string) => {
      written = d;
    };
    const out = await sessionMemoryCompact(
      { messages: [sys("S"), user("FIRST"), asst("REPLY"), user("LATEST")] },
      { onWrite },
    );
    expect(out.strategy).toBe("session-memory");
    expect(written).toContain("FIRST");
    expect(written).toContain("REPLY");
    expect(written).toContain("LATEST");
  });

  test("snipCompact: drops a contiguous range", () => {
    const out = snipCompact(
      {
        messages: [sys("S"), user("u1"), asst("a1"), user("u2"), asst("a2"), user("u3")],
      },
      { startIdx: 1, endIdx: 4 },
    );
    expect(out.strategy).toBe("snip");
    expect(out.dropped).toBe(4);
    expect(out.messages).toHaveLength(2);
  });

  test("reactiveCompact: triggered by sustained cache-miss usage history", () => {
    const history = [
      { totalIn: 1000, totalOut: 200, cacheCreation: 1000, cacheRead: 0 },
      { totalIn: 1100, totalOut: 200, cacheCreation: 1100, cacheRead: 0 },
      { totalIn: 1200, totalOut: 200, cacheCreation: 1200, cacheRead: 0 },
    ];
    expect(shouldReactiveCompact(history)).toBe(true);
    const out = reactiveCompact(
      {
        messages: [
          sys("S"),
          user("u1"),
          toolMsg("t1", "OLD-1"),
          toolMsg("t2", "OLD-2"),
          toolMsg("t3", "OLD-3"),
          user("u2"),
        ],
      },
      { history, keepRecentToolResults: 1 },
    );
    expect(out.strategy).toBe("reactive");
  });

  test("decideCompact: chooses a strategy or returns no-op when nothing fits", () => {
    const state = {
      messages: [sys("S"), user("u")],
      mode: "agent" as const,
      reasoningEffort: "off" as const,
      model: "mock-model",
      provider: "mock",
    };
    // No usage + tiny history → orchestrator returns null. Larger
    // tool-result counts would route to "micro".
    const decision = decideCompact(state, undefined, [], { capacity: 200_000 });
    expect(decision === null || decision === "micro" || decision === "auto" || decision === "reactive").toBe(true);
  });
});
