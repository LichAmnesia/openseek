import { test, expect } from "bun:test";
import {
  isAssistantText,
  isAssistantThinking,
  isCancelled,
  isError,
  isToolCall,
  isToolResult,
  isUser,
  type TranscriptMessage,
} from "../src/types.ts";

const sample: TranscriptMessage[] = [
  { id: "1", kind: "user", text: "hi" },
  { id: "2", kind: "assistant-text", text: "yo" },
  { id: "3", kind: "assistant-thinking", text: "let me think" },
  { id: "4", kind: "tool-call", toolName: "read", args: { path: "x" }, toolCallId: "t1" },
  { id: "5", kind: "tool-result", result: "ok", toolCallId: "t1" },
  { id: "6", kind: "error", text: "boom" },
  { id: "7", kind: "cancelled" },
];

test("isUser identifies only user rows", () => {
  expect(sample.filter(isUser).map((m) => m.id)).toEqual(["1"]);
});

test("isAssistantText / isAssistantThinking are exclusive", () => {
  const aText = sample.filter(isAssistantText);
  const aThink = sample.filter(isAssistantThinking);
  expect(aText.map((m) => m.id)).toEqual(["2"]);
  expect(aThink.map((m) => m.id)).toEqual(["3"]);
});

test("isToolCall / isToolResult split tool rows", () => {
  expect(sample.filter(isToolCall).map((m) => m.id)).toEqual(["4"]);
  expect(sample.filter(isToolResult).map((m) => m.id)).toEqual(["5"]);
});

test("isError / isCancelled identify failure-ish rows", () => {
  expect(sample.filter(isError).map((m) => m.id)).toEqual(["6"]);
  expect(sample.filter(isCancelled).map((m) => m.id)).toEqual(["7"]);
});

test("type guards narrow correctly", () => {
  // Compile-time check disguised as a runtime assert. If `isAssistantThinking`
  // doesn't narrow, `m.text` access would fail typecheck.
  for (const m of sample) {
    if (isAssistantThinking(m)) {
      expect(typeof m.text).toBe("string");
    }
    if (isToolCall(m)) {
      expect(typeof m.toolName).toBe("string");
      expect(typeof m.toolCallId).toBe("string");
    }
  }
});
