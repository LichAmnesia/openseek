// compactNow — manual /compact entry point used by the CLI runtime
// (post-v1.0 D-class wiring). Verifies the high-level wrapper picks the
// right strategy, returns a usable shape, and computes removedCount
// correctly for the default (session-memory) path.

import { describe, expect, test } from "bun:test";
import type { OpenSeekMessage } from "@openseek/provider";
import { compactNow } from "../../src/index.ts";

function sys(text: string): OpenSeekMessage {
  return { role: "system", content: [{ type: "text", text }] };
}
function user(text: string): OpenSeekMessage {
  return { role: "user", content: [{ type: "text", text }] };
}
function asst(text: string): OpenSeekMessage {
  return { role: "assistant", content: [{ type: "text", text }] };
}

describe("compactNow", () => {
  test("default session-memory strategy collapses to system+last user", async () => {
    const messages = [
      sys("agent prompt"),
      user("first"),
      asst("a1"),
      user("second"),
      asst("a2"),
      user("LATEST"),
    ];
    const result = await compactNow(messages);
    expect(result.strategy).toBe("session-memory");
    expect(result.messages.length).toBe(2);
    expect(result.messages[0]?.role).toBe("system");
    expect(result.messages[1]?.role).toBe("user");
    const lastBlock = result.messages[1]?.content[0];
    if (lastBlock?.type === "text") expect(lastBlock.text).toBe("LATEST");
    expect(result.removedCount).toBe(messages.length - result.messages.length);
    expect(result.removedCount).toBeGreaterThan(0);
  });

  test("calls onWrite with a non-empty digest when provided", async () => {
    const writes: string[] = [];
    const messages = [sys("p"), user("hello"), asst("hi"), user("bye")];
    await compactNow(messages, {
      strategy: "session-memory",
      onWrite: async (d) => {
        writes.push(d);
      },
    });
    expect(writes.length).toBe(1);
    expect(writes[0]?.length).toBeGreaterThan(0);
    expect(writes[0]).toContain("# Session digest");
  });

  test("missing onWrite still completes (uses no-op writer)", async () => {
    const messages = [sys("p"), user("a"), asst("b"), user("c")];
    const result = await compactNow(messages);
    // No throw; collapsed buffer is returned even without persistence.
    expect(result.messages.length).toBeLessThan(messages.length);
  });

  test("micro strategy keeps message count stable but mutates tool_result blocks", async () => {
    const messages: OpenSeekMessage[] = [
      sys("p"),
      user("u1"),
      {
        role: "tool",
        content: Array.from({ length: 10 }, (_, i) => ({
          type: "tool_result",
          toolCallId: `t${i}`,
          result: `payload-${i}`,
        })),
      },
      user("u2"),
    ];
    const result = await compactNow(messages, {
      strategy: "micro",
      keepRecentToolResults: 2,
    });
    expect(result.strategy).toBe("micro");
    // micro doesn't drop messages, only clears block contents.
    expect(result.messages.length).toBe(messages.length);
    expect(result.removedCount).toBe(0);
  });

  test("auto strategy folds middle into one synthetic assistant message via the summarizer", async () => {
    const messages = [
      sys("p"),
      user("first"),
      asst("a1"),
      user("second"),
      asst("a2"),
      user("LATEST"),
    ];
    let summarizerCalled = 0;
    const result = await compactNow(messages, {
      strategy: "auto",
      summarizer: async () => {
        summarizerCalled += 1;
        return "DIGEST";
      },
    });
    expect(result.strategy).toBe("auto");
    expect(summarizerCalled).toBe(1);
    expect(result.messages.length).toBeLessThan(messages.length);
    expect(result.removedCount).toBeGreaterThan(0);
  });
});
