// snipCompact unit tests (SPEC G2.1 #5).

import { describe, expect, test } from "bun:test";
import type { OpenSeekMessage } from "@openseek/provider";
import { snipCompact } from "../../src/compact/index.ts";

function user(text: string): OpenSeekMessage {
  return { role: "user", content: [{ type: "text", text }] };
}

describe("snipCompact", () => {
  const messages = [user("a"), user("b"), user("c"), user("d"), user("e")];

  test("removes a middle range (inclusive)", () => {
    const out = snipCompact({ messages }, { startIdx: 1, endIdx: 3 });
    expect(out.dropped).toBe(3);
    expect(out.messages).toHaveLength(2);
    expect(out.strategy).toBe("snip");
    const texts = out.messages.map((m) => {
      const b = m.content[0]!;
      return b.type === "text" ? b.text : "";
    });
    expect(texts).toEqual(["a", "e"]);
  });

  test("removes leading and trailing edges", () => {
    const head = snipCompact({ messages }, { startIdx: 0, endIdx: 0 });
    expect(head.messages.map((m) => (m.content[0]?.type === "text" ? m.content[0]?.text : "")))
      .toEqual(["b", "c", "d", "e"]);

    const tail = snipCompact({ messages }, { startIdx: 4, endIdx: 4 });
    expect(tail.messages.map((m) => (m.content[0]?.type === "text" ? m.content[0]?.text : "")))
      .toEqual(["a", "b", "c", "d"]);
  });

  test("throws when startIdx > endIdx", () => {
    expect(() => snipCompact({ messages }, { startIdx: 3, endIdx: 1 })).toThrow(RangeError);
  });

  test("throws when range is out of bounds", () => {
    expect(() => snipCompact({ messages }, { startIdx: -1, endIdx: 0 })).toThrow(RangeError);
    expect(() => snipCompact({ messages }, { startIdx: 0, endIdx: 99 })).toThrow(RangeError);
    expect(() => snipCompact({ messages }, { startIdx: 1.5, endIdx: 2 })).toThrow(RangeError);
  });
});
