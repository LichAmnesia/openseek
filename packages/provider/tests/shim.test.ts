// Round-trip and edge-case coverage for the Anthropic ↔ OpenSeek protocol shim.

import { expect, test } from "bun:test";
import {
  type AnthropicMessage,
  anthropicToOpenSeek,
  openSeekToAnthropic,
} from "../src/shim.ts";
import type { OpenSeekMessage } from "../src/types.ts";

function roundTrip(msg: AnthropicMessage): AnthropicMessage {
  return openSeekToAnthropic(anthropicToOpenSeek(msg));
}

// ── basic single-block messages ──

test("round-trips a plain user text message", () => {
  const msg: AnthropicMessage = {
    role: "user",
    content: [{ type: "text", text: "hello" }],
  };
  expect(roundTrip(msg)).toEqual(msg);
});

test("round-trips a plain assistant text message", () => {
  const msg: AnthropicMessage = {
    role: "assistant",
    content: [{ type: "text", text: "hi back" }],
  };
  expect(roundTrip(msg)).toEqual(msg);
});

// ── thinking ──

test("round-trips an assistant thinking + text response", () => {
  const msg: AnthropicMessage = {
    role: "assistant",
    content: [
      { type: "thinking", thinking: "reasoning...", signature: "sig-1" },
      { type: "text", text: "the answer is 42" },
    ],
  };
  const out = roundTrip(msg);
  // signature is dropped through the OpenSeek hop; thinking text is preserved.
  expect(out.content[0]?.type).toBe("thinking");
  expect((out.content[0] as { thinking: string }).thinking).toBe("reasoning...");
  expect(out.content[1]).toEqual({ type: "text", text: "the answer is 42" });
});

test("anthropicToOpenSeek lifts thinking into reasoningContent", () => {
  const msg: AnthropicMessage = {
    role: "assistant",
    content: [
      { type: "thinking", thinking: "step 1, step 2" },
      { type: "text", text: "done" },
    ],
  };
  const out = anthropicToOpenSeek(msg);
  expect(out.reasoningContent).toBe("step 1, step 2");
});

// ── tool use & tool result ──

test("round-trips a tool_use assistant message", () => {
  const msg: AnthropicMessage = {
    role: "assistant",
    content: [
      { type: "text", text: "let me check" },
      {
        type: "tool_use",
        id: "toolu_01",
        name: "search",
        input: { q: "openseek" },
      },
    ],
  };
  expect(roundTrip(msg)).toEqual(msg);
});

test("round-trips a tool_result user message", () => {
  const msg: AnthropicMessage = {
    role: "user",
    content: [
      {
        type: "tool_result",
        tool_use_id: "toolu_01",
        content: "result text",
      },
    ],
  };
  expect(roundTrip(msg)).toEqual(msg);
});

test("round-trips a tool_result with is_error flag", () => {
  const msg: AnthropicMessage = {
    role: "user",
    content: [
      {
        type: "tool_result",
        tool_use_id: "toolu_42",
        content: "boom",
        is_error: true,
      },
    ],
  };
  expect(roundTrip(msg)).toEqual(msg);
});

// ── multi-turn ──

test("round-trips a multi-turn text + tool conversation", () => {
  const turns: AnthropicMessage[] = [
    { role: "user", content: [{ type: "text", text: "what's 2+2?" }] },
    {
      role: "assistant",
      content: [
        { type: "thinking", thinking: "trivial arithmetic" },
        {
          type: "tool_use",
          id: "toolu_a",
          name: "calc",
          input: { expr: "2+2" },
        },
      ],
    },
    {
      role: "user",
      content: [
        {
          type: "tool_result",
          tool_use_id: "toolu_a",
          content: "4",
        },
      ],
    },
    {
      role: "assistant",
      content: [{ type: "text", text: "4" }],
    },
  ];

  for (const t of turns) {
    const out = roundTrip(t);
    expect(out.role).toBe(t.role);
    expect(out.content.length).toBe(t.content.length);
  }
});

// ── edge cases ──

test("openSeekToAnthropic throws for system role", () => {
  const sys: OpenSeekMessage = {
    role: "system",
    content: [{ type: "text", text: "sys prompt" }],
  };
  expect(() => openSeekToAnthropic(sys)).toThrow();
});

test("anthropicToOpenSeek flips tool_result user messages to tool role", () => {
  const msg: AnthropicMessage = {
    role: "user",
    content: [
      {
        type: "tool_result",
        tool_use_id: "toolu_x",
        content: "ok",
      },
    ],
  };
  const out = anthropicToOpenSeek(msg);
  expect(out.role).toBe("tool");
  expect(out.toolCallId).toBe("toolu_x");
});

test("round-trips an image url block via the marker shim", () => {
  const msg: AnthropicMessage = {
    role: "user",
    content: [
      {
        type: "image",
        source: { type: "url", url: "https://example.com/cat.png" },
      },
    ],
  };
  const out = roundTrip(msg);
  expect(out.content[0]?.type).toBe("image");
  expect((out.content[0] as { source: { url: string } }).source.url).toBe(
    "https://example.com/cat.png",
  );
});

test("round-trips a base64 image block", () => {
  const msg: AnthropicMessage = {
    role: "user",
    content: [
      {
        type: "image",
        source: {
          type: "base64",
          media_type: "image/jpeg",
          data: "AAAA",
        },
      },
    ],
  };
  const out = roundTrip(msg);
  expect(out.content[0]?.type).toBe("image");
  expect(
    (out.content[0] as { source: { media_type: string } }).source.media_type,
  ).toBe("image/jpeg");
});

test("empty content array round-trips", () => {
  const msg: AnthropicMessage = { role: "user", content: [] };
  expect(roundTrip(msg)).toEqual(msg);
});

test("round-trips a tool_result whose content is an array of text blocks", () => {
  const msg: AnthropicMessage = {
    role: "user",
    content: [
      {
        type: "tool_result",
        tool_use_id: "toolu_arr",
        content: [
          { type: "text", text: "part1" },
          { type: "text", text: "part2" },
        ],
      },
    ],
  };
  const opened = anthropicToOpenSeek(msg);
  // Array form is normalized to a string when crossing the shim.
  expect(opened.content[0]?.type).toBe("tool_result");
  const tr = opened.content[0] as { result: unknown };
  expect(tr.result).toBe("part1part2");
});
