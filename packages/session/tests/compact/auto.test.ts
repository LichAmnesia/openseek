// autoCompact unit tests (SPEC G2.1 #2).

import { describe, expect, test } from "bun:test";
import type { OpenSeekMessage } from "@openseek/provider";
import { autoCompact } from "../../src/compact/index.ts";

function sys(text: string): OpenSeekMessage {
  return { role: "system", content: [{ type: "text", text }] };
}
function user(text: string): OpenSeekMessage {
  return { role: "user", content: [{ type: "text", text }] };
}
function asst(text: string): OpenSeekMessage {
  return { role: "assistant", content: [{ type: "text", text }] };
}

describe("autoCompact", () => {
  test("invokes summarizer with middle slice and inserts digest after system", async () => {
    const captured: OpenSeekMessage[][] = [];
    const summarizer = async (msgs: OpenSeekMessage[]) => {
      captured.push(msgs);
      return "DIGEST_TEXT";
    };
    const messages = [
      sys("you are an agent"),
      user("first question"),
      asst("first answer"),
      user("second question"),
      asst("second answer"),
      user("third question"),
    ];
    const out = await autoCompact({ messages }, { summarizer });

    expect(captured).toHaveLength(1);
    // Middle = idx 1..4 (everything except system + last user).
    expect(captured[0]).toHaveLength(4);

    // Output: [system, summary-asst, last-user]
    expect(out.messages).toHaveLength(3);
    expect(out.messages[0]?.role).toBe("system");
    expect(out.messages[1]?.role).toBe("assistant");
    const summaryBlock = out.messages[1]?.content[0]!;
    if (summaryBlock.type === "text") {
      expect(summaryBlock.text).toContain("DIGEST_TEXT");
      expect(summaryBlock.text).toContain("[auto-compact summary]");
    }
    expect(out.messages[2]?.role).toBe("user");
    expect(out.strategy).toBe("auto");
    expect(out.dropped).toBe(3);
  });

  test("no-op when fewer than 3 messages", async () => {
    let called = false;
    const summarizer = async () => {
      called = true;
      return "x";
    };
    const messages = [user("hi"), asst("hello")];
    const out = await autoCompact({ messages }, { summarizer });
    expect(out.dropped).toBe(0);
    expect(out.messages).toHaveLength(2);
    expect(called).toBe(false);
  });

  test("inserts summary directly after multi-system block", async () => {
    const summarizer = async () => "SHORT";
    const messages = [
      sys("system 1"),
      sys("system 2"),
      user("q1"),
      asst("a1"),
      user("q2"),
    ];
    const out = await autoCompact({ messages }, { summarizer });
    expect(out.messages[0]?.role).toBe("system");
    expect(out.messages[1]?.role).toBe("system");
    expect(out.messages[2]?.role).toBe("assistant"); // synthetic digest
    expect(out.messages[3]?.role).toBe("user"); // last user preserved
    expect(out.messages).toHaveLength(4);
  });
});
