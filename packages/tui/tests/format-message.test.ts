import { test, expect } from "bun:test";
import type { OpenSeekMessage } from "@openseek/provider";
import {
  summarizeArgs,
  summarizeResult,
  toTranscriptMessages,
} from "../src/format-message.ts";

test("user message → 1 user row", () => {
  const msg: OpenSeekMessage = {
    role: "user",
    content: [{ type: "text", text: "hello" }],
  };
  const rows = toTranscriptMessages(msg);
  expect(rows.length).toBe(1);
  expect(rows[0]?.kind).toBe("user");
  if (rows[0]?.kind === "user") expect(rows[0].text).toBe("hello");
});

test("empty user message → no rows", () => {
  const msg: OpenSeekMessage = { role: "user", content: [] };
  expect(toTranscriptMessages(msg)).toEqual([]);
});

test("assistant text-only → 1 assistant-text row", () => {
  const msg: OpenSeekMessage = {
    role: "assistant",
    content: [{ type: "text", text: "answer" }],
  };
  const rows = toTranscriptMessages(msg);
  expect(rows.length).toBe(1);
  expect(rows[0]?.kind).toBe("assistant-text");
});

test("assistant thinking + text → 2 rows in order (G1.4 split)", () => {
  const msg: OpenSeekMessage = {
    role: "assistant",
    content: [
      { type: "thinking", text: "weighing options" },
      { type: "text", text: "final answer" },
    ],
  };
  const rows = toTranscriptMessages(msg);
  expect(rows.length).toBe(2);
  expect(rows[0]?.kind).toBe("assistant-thinking");
  expect(rows[1]?.kind).toBe("assistant-text");
});

test("assistant thinking + text + tool_call → 3 rows", () => {
  const msg: OpenSeekMessage = {
    role: "assistant",
    content: [
      { type: "thinking", text: "I should read foo.ts" },
      { type: "text", text: "Reading file..." },
      { type: "tool_call", toolCallId: "tc1", toolName: "read", args: { path: "foo.ts" } },
    ],
  };
  const rows = toTranscriptMessages(msg);
  expect(rows.length).toBe(3);
  expect(rows.map((r) => r.kind)).toEqual([
    "assistant-thinking",
    "assistant-text",
    "tool-call",
  ]);
});

test("tool role → tool-result row(s)", () => {
  const msg: OpenSeekMessage = {
    role: "tool",
    content: [{ type: "tool_result", toolCallId: "tc1", result: "file contents" }],
  };
  const rows = toTranscriptMessages(msg);
  expect(rows.length).toBe(1);
  expect(rows[0]?.kind).toBe("tool-result");
});

test("system message → system row", () => {
  const msg: OpenSeekMessage = {
    role: "system",
    content: [{ type: "text", text: "rules" }],
  };
  const rows = toTranscriptMessages(msg);
  expect(rows.length).toBe(1);
  expect(rows[0]?.kind).toBe("system");
});

test("ids are unique across blocks of the same message", () => {
  const msg: OpenSeekMessage = {
    role: "assistant",
    content: [
      { type: "thinking", text: "a" },
      { type: "text", text: "b" },
      { type: "tool_call", toolCallId: "x", toolName: "y", args: {} },
    ],
  };
  const rows = toTranscriptMessages(msg, "pfx", 7);
  const ids = rows.map((r) => r.id);
  expect(new Set(ids).size).toBe(ids.length);
  expect(ids[0]?.startsWith("pfx-7-")).toBe(true);
});

test("empty thinking block is dropped (no blank-row noise)", () => {
  const msg: OpenSeekMessage = {
    role: "assistant",
    content: [
      { type: "thinking", text: "" },
      { type: "text", text: "answer" },
    ],
  };
  const rows = toTranscriptMessages(msg);
  expect(rows.length).toBe(1);
  expect(rows[0]?.kind).toBe("assistant-text");
});

test("summarizeArgs truncates long objects with ellipsis", () => {
  const long = { path: "x".repeat(200) };
  const out = summarizeArgs(long, 40);
  expect(out.length).toBeLessThanOrEqual(40);
  expect(out.endsWith("…")).toBe(true);
});

test("summarizeArgs handles undefined / null", () => {
  expect(summarizeArgs(undefined)).toBe("");
  expect(summarizeArgs(null)).toBe("");
});

test("summarizeResult truncates long strings", () => {
  const out = summarizeResult("a".repeat(500), 100);
  expect(out.length).toBeLessThanOrEqual(101); // 100 + ellipsis
  expect(out.endsWith("…")).toBe(true);
});
