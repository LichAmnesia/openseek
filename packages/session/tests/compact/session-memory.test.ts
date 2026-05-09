// sessionMemoryCompact unit tests (SPEC G2.1 #4).

import { describe, expect, test } from "bun:test";
import type { OpenSeekMessage } from "@openseek/provider";
import { sessionMemoryCompact } from "../../src/compact/index.ts";

function sys(text: string): OpenSeekMessage {
  return { role: "system", content: [{ type: "text", text }] };
}
function user(text: string): OpenSeekMessage {
  return { role: "user", content: [{ type: "text", text }] };
}
function asst(text: string): OpenSeekMessage {
  return { role: "assistant", content: [{ type: "text", text }] };
}

describe("sessionMemoryCompact", () => {
  test("calls onWrite hook with non-empty digest", async () => {
    const writes: string[] = [];
    const onWrite = async (digest: string) => {
      writes.push(digest);
    };
    const messages = [sys("agent prompt"), user("first"), asst("answer"), user("latest")];
    await sessionMemoryCompact({ messages }, { onWrite });
    expect(writes).toHaveLength(1);
    expect(writes[0]?.length).toBeGreaterThan(0);
  });

  test("digest content references each role's text", async () => {
    let captured = "";
    const onWrite = async (d: string) => {
      captured = d;
    };
    const messages = [
      sys("you are X"),
      user("ABRACADABRA"),
      asst("OPENSESAME"),
      user("FINALWORD"),
    ];
    await sessionMemoryCompact({ messages }, { onWrite });
    expect(captured).toContain("ABRACADABRA");
    expect(captured).toContain("OPENSESAME");
    expect(captured).toContain("FINALWORD");
    expect(captured).toContain("# Session digest");
  });

  test("output is system block + last user only", async () => {
    const onWrite = async () => {};
    const messages = [
      sys("system 1"),
      sys("system 2"),
      user("u1"),
      asst("a1"),
      user("u2"),
      asst("a2"),
      user("u3-last"),
    ];
    const out = await sessionMemoryCompact({ messages }, { onWrite });
    expect(out.strategy).toBe("session-memory");
    expect(out.messages).toHaveLength(3);
    expect(out.messages[0]?.role).toBe("system");
    expect(out.messages[1]?.role).toBe("system");
    expect(out.messages[2]?.role).toBe("user");
    const block = out.messages[2]?.content[0]!;
    if (block.type === "text") expect(block.text).toBe("u3-last");
    expect(out.dropped).toBe(4);
  });
});
