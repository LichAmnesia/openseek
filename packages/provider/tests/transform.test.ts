import { expect, test } from "bun:test";
import { extractReasoning, replayReasoning } from "../src/transform.ts";
import type { OpenSeekMessage } from "../src/types.ts";

function userMsg(text: string): OpenSeekMessage {
  return { role: "user", content: [{ type: "text", text }] };
}

function assistantWithToolCall(opts: {
  reasoning?: string;
  toolName?: string;
  toolCallId?: string;
  args?: unknown;
  text?: string;
}): OpenSeekMessage {
  const content: OpenSeekMessage["content"] = [];
  if (opts.text) content.push({ type: "text", text: opts.text });
  content.push({
    type: "tool_call",
    toolCallId: opts.toolCallId ?? "call_1",
    toolName: opts.toolName ?? "read",
    args: opts.args ?? { path: "a.txt" },
  });
  return opts.reasoning !== undefined
    ? { role: "assistant", content, reasoningContent: opts.reasoning }
    : { role: "assistant", content };
}

function toolResult(callId: string, text: string): OpenSeekMessage {
  return {
    role: "tool",
    toolCallId: callId,
    content: [{ type: "tool_result", toolCallId: callId, result: text }],
  };
}

test("replayReasoning inlines reasoningContent into assistant tool_call message", () => {
  const msgs: OpenSeekMessage[] = [
    userMsg("hi"),
    assistantWithToolCall({ reasoning: "thinking about the file" }),
  ];
  const out = replayReasoning(msgs, true);
  const assistant = out[1];
  if (!assistant || assistant.role !== "assistant") throw new Error("no assistant");
  expect(assistant.content[0]?.type).toBe("thinking");
  if (assistant.content[0]?.type !== "thinking") throw new Error("thinking missing");
  expect(assistant.content[0].text).toBe("thinking about the file");
  // tool_call still present
  expect(assistant.content.some((b) => b.type === "tool_call")).toBe(true);
});

test("replayReasoning leaves assistant messages without tool_calls untouched", () => {
  const msgs: OpenSeekMessage[] = [
    userMsg("hi"),
    {
      role: "assistant",
      content: [{ type: "text", text: "hello" }],
      reasoningContent: "I should greet",
    },
  ];
  const out = replayReasoning(msgs, true);
  expect(out[1]?.content).toHaveLength(1);
  expect(out[1]?.content[0]?.type).toBe("text");
});

test("replayReasoning is a no-op when requiresReplay is false", () => {
  const msgs: OpenSeekMessage[] = [
    userMsg("hi"),
    assistantWithToolCall({ reasoning: "should not be inlined" }),
  ];
  const out = replayReasoning(msgs, false);
  // No thinking block should be added.
  expect(out[1]?.content[0]?.type).toBe("tool_call");
});

test("replayReasoning returns a new array reference", () => {
  const msgs: OpenSeekMessage[] = [userMsg("hi")];
  const out = replayReasoning(msgs, true);
  expect(Object.is(out, msgs)).toBe(false);
});

test("replayReasoning false-mode also returns a new array reference", () => {
  const msgs: OpenSeekMessage[] = [userMsg("hi")];
  const out = replayReasoning(msgs, false);
  expect(Object.is(out, msgs)).toBe(false);
});

test("replayReasoning does not mutate input messages", () => {
  const orig = assistantWithToolCall({ reasoning: "private thoughts" });
  const origContentLen = orig.content.length;
  const msgs: OpenSeekMessage[] = [userMsg("hi"), orig];
  replayReasoning(msgs, true);
  expect(orig.content).toHaveLength(origContentLen);
  expect(orig.content[0]?.type).toBe("tool_call");
});

test("replayReasoning skips assistant tool_call when reasoningContent is missing", () => {
  const msgs: OpenSeekMessage[] = [userMsg("hi"), assistantWithToolCall({})];
  const out = replayReasoning(msgs, true);
  // No reasoning to replay → no thinking block added.
  expect(out[1]?.content[0]?.type).toBe("tool_call");
});

test("replayReasoning skips when assistant content already starts with thinking", () => {
  const msgs: OpenSeekMessage[] = [
    userMsg("hi"),
    {
      role: "assistant",
      reasoningContent: "older",
      content: [
        { type: "thinking", text: "already inlined" },
        { type: "tool_call", toolCallId: "x", toolName: "read", args: {} },
      ],
    },
  ];
  const out = replayReasoning(msgs, true);
  // Should not double-inline; first thinking stays as-is.
  const head = out[1]?.content[0];
  expect(head?.type).toBe("thinking");
  if (head?.type !== "thinking") throw new Error("unreachable");
  expect(head.text).toBe("already inlined");
  // Length unchanged.
  expect(out[1]?.content).toHaveLength(2);
});

test("replayReasoning round-trip: 3-turn conversation with two tool_call messages", () => {
  const a1 = assistantWithToolCall({
    reasoning: "first thought",
    toolCallId: "call_1",
    toolName: "read",
  });
  const a2 = assistantWithToolCall({
    reasoning: "second thought",
    toolCallId: "call_2",
    toolName: "grep",
  });
  const msgs: OpenSeekMessage[] = [
    userMsg("first"),
    a1,
    toolResult("call_1", "file contents"),
    a2,
    toolResult("call_2", "matches"),
    userMsg("anything else?"),
    {
      role: "assistant",
      content: [{ type: "text", text: "final answer" }],
    },
  ];
  const out = replayReasoning(msgs, true);
  expect(out).toHaveLength(7);

  const r1 = out[1];
  if (!r1 || r1.role !== "assistant") throw new Error("missing a1");
  expect(r1.content[0]?.type).toBe("thinking");
  if (r1.content[0]?.type !== "thinking") throw new Error("thinking missing");
  expect(r1.content[0].text).toBe("first thought");

  const r2 = out[3];
  if (!r2 || r2.role !== "assistant") throw new Error("missing a2");
  expect(r2.content[0]?.type).toBe("thinking");
  if (r2.content[0]?.type !== "thinking") throw new Error("thinking missing");
  expect(r2.content[0].text).toBe("second thought");

  // Final assistant (text-only, no tool_call) untouched.
  const last = out[6];
  if (!last || last.role !== "assistant") throw new Error("missing last");
  expect(last.content).toHaveLength(1);
  expect(last.content[0]?.type).toBe("text");
});

test("replayReasoning preserves non-assistant messages by reference", () => {
  const u = userMsg("hi");
  const tr = toolResult("call_1", "result");
  const a = assistantWithToolCall({ reasoning: "x" });
  const out = replayReasoning([u, a, tr], true);
  expect(out[0]).toBe(u);
  expect(out[2]).toBe(tr);
  // assistant rewritten — different reference.
  expect(out[1]).not.toBe(a);
});

test("replayReasoning leaves user/tool messages alone even with reasoningContent set", () => {
  const weirdUser: OpenSeekMessage = {
    role: "user",
    content: [{ type: "text", text: "hi" }],
    reasoningContent: "shouldn't be replayed",
  };
  const out = replayReasoning([weirdUser], true);
  expect(out[0]?.content).toHaveLength(1);
  expect(out[0]?.content[0]?.type).toBe("text");
});

test("extractReasoning prefers `reasoning` field", () => {
  expect(extractReasoning({ reasoning: "abc" })).toBe("abc");
});

test("extractReasoning falls back to camelCase reasoningContent", () => {
  expect(extractReasoning({ reasoningContent: "from camel" })).toBe("from camel");
});

test("extractReasoning falls back to snake_case reasoning_content", () => {
  expect(extractReasoning({ reasoning_content: "from snake" })).toBe("from snake");
});

test("extractReasoning returns undefined for empty/missing/null", () => {
  expect(extractReasoning({})).toBeUndefined();
  expect(extractReasoning(null)).toBeUndefined();
  expect(extractReasoning(undefined)).toBeUndefined();
  expect(extractReasoning({ reasoning: "" })).toBeUndefined();
  expect(extractReasoning({ reasoning: 123 as unknown as string })).toBeUndefined();
});
