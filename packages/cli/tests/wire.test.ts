import { test, expect } from "bun:test";
import {
  createRouting,
  freshAssistantTextRow,
  freshAssistantThinkingRow,
  userMessage,
  userRow,
} from "../src/wire.ts";
import type { TranscriptMessage } from "@openseek/tui";

interface Captured {
  rows: TranscriptMessage[];
  textAppends: string[];
  thinkingAppends: string[];
  statuses: string[];
}

function makeHooks(): { cap: Captured; hooks: Parameters<typeof createRouting>[0] } {
  const cap: Captured = { rows: [], textAppends: [], thinkingAppends: [], statuses: [] };
  return {
    cap,
    hooks: {
      appendRow: (r) => cap.rows.push(r),
      updateLastAssistantText: (t) => cap.textAppends.push(t),
      updateLastAssistantThinking: (t) => cap.thinkingAppends.push(t),
      setStatus: (s) => cap.statuses.push(s),
    },
  };
}

test("text-delta routes to updateLastAssistantText", () => {
  const { cap, hooks } = makeHooks();
  const r = createRouting(hooks);
  r.apply({ type: "text-delta", delta: "hello" });
  expect(cap.textAppends).toEqual(["hello"]);
});

test("thinking-delta routes to updateLastAssistantThinking", () => {
  const { cap, hooks } = makeHooks();
  const r = createRouting(hooks);
  r.apply({ type: "thinking-delta", delta: "uh" });
  expect(cap.thinkingAppends).toEqual(["uh"]);
});

test("tool-call appends a tool-call row", () => {
  const { cap, hooks } = makeHooks();
  const r = createRouting(hooks);
  r.apply({ type: "tool-call", call: { id: "c1", name: "read", input: { path: "x.ts" } } });
  expect(cap.rows.length).toBe(1);
  const row = cap.rows[0];
  expect(row?.kind).toBe("tool-call");
  if (row?.kind === "tool-call") {
    expect(row.toolName).toBe("read");
    expect(row.toolCallId).toBe("c1");
  }
});

test("tool-result appends tool-result row", () => {
  const { cap, hooks } = makeHooks();
  const r = createRouting(hooks);
  r.apply({
    type: "tool-result",
    result: {
      id: "c1",
      name: "read",
      result: { kind: "text", text: "hello" },
    },
  });
  expect(cap.rows[0]?.kind).toBe("tool-result");
});

test("cancelled flips status + appends row", () => {
  const { cap, hooks } = makeHooks();
  const r = createRouting(hooks);
  r.apply({ type: "cancelled" });
  expect(cap.statuses).toContain("cancelled");
  expect(cap.rows[0]?.kind).toBe("cancelled");
});

test("error flips status + appends row with message", () => {
  const { cap, hooks } = makeHooks();
  const r = createRouting(hooks);
  r.apply({ type: "error", err: new Error("oops") });
  expect(cap.statuses).toContain("error");
  const row = cap.rows[0];
  expect(row?.kind).toBe("error");
  if (row?.kind === "error") expect(row.text).toBe("oops");
});

test("turn-end sets status idle", () => {
  const { cap, hooks } = makeHooks();
  const r = createRouting(hooks);
  r.apply({ type: "turn-end" });
  expect(cap.statuses).toEqual(["idle"]);
});

test("userRow / freshAssistantTextRow / freshAssistantThinkingRow have correct kinds", () => {
  expect(userRow("hi").kind).toBe("user");
  expect(freshAssistantTextRow().kind).toBe("assistant-text");
  expect(freshAssistantThinkingRow().kind).toBe("assistant-thinking");
});

test("userMessage builds OpenSeekMessage shape", () => {
  const m = userMessage("hello");
  expect(m.role).toBe("user");
  expect(m.content[0]).toMatchObject({ type: "text", text: "hello" });
});

test("ids are unique across calls", () => {
  const a = userRow("x").id;
  const b = userRow("y").id;
  expect(a).not.toBe(b);
});

// F5 P0-NEW #1: cancel + assistant-turn together must NOT double-append history.
test("F5 P0-NEW #1: assistant-turn + cancelled append history exactly once", () => {
  const { cap, hooks } = makeHooks();
  const historyAppends: number[] = [];
  let appendCount = 0;
  const fullHooks = {
    ...hooks,
    appendHistory: (msgs: import("@openseek/provider").OpenSeekMessage[]) => {
      appendCount += 1;
      historyAppends.push(msgs.length);
    },
  };
  const r = createRouting(fullHooks);
  // Simulate F5 contract: assistant-turn fires, then cancelled (without
  // turnMessages). appendHistory must fire EXACTLY once.
  r.apply({
    type: "assistant-turn",
    messages: [
      {
        role: "assistant",
        content: [{ type: "text", text: "partial" }],
      },
    ],
  });
  r.apply({ type: "cancelled" });
  expect(appendCount).toBe(1);
  expect(historyAppends).toEqual([1]);
  expect(cap.statuses).toContain("cancelled");
  expect(cap.rows.some((row) => row.kind === "cancelled")).toBe(true);
});
