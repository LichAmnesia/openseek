// decideCompact orchestrator unit tests (SPEC G2.1).

import { describe, expect, test } from "bun:test";
import type { OpenSeekMessage } from "@openseek/provider";
import { decideCompact } from "../../src/compact/index.ts";
import type { SessionState, UsageSnapshot } from "../../src/types.ts";

function tr(id: string): OpenSeekMessage {
  return {
    role: "tool",
    content: [{ type: "tool_result", toolCallId: id, result: id }],
    toolCallId: id,
  };
}

function state(messages: OpenSeekMessage[]): SessionState {
  return {
    messages,
    mode: "agent",
    reasoningEffort: "off",
    model: "deepseek-chat",
    provider: "mikan",
  };
}

describe("decideCompact", () => {
  test("returns null when nothing to compact", () => {
    const result = decideCompact(state([]), undefined, []);
    expect(result).toBeNull();
  });

  test("returns 'micro' when many tool_results accumulate", () => {
    const messages = ["a", "b", "c", "d", "e", "f", "g", "h"].map((id) => tr(id));
    const result = decideCompact(state(messages), undefined, []);
    expect(result).toBe("micro");
  });

  test("returns 'auto' when usage exceeds 80% capacity", () => {
    const usage: UsageSnapshot = { totalIn: 90_000, totalOut: 1_000 };
    const result = decideCompact(state([tr("a")]), usage, [], { capacity: 100_000 });
    expect(result).toBe("auto");
  });

  test("returns 'reactive' when cache miss pattern detected", () => {
    const history: UsageSnapshot[] = [
      { totalIn: 10, totalOut: 5, cacheRead: 0, cacheCreation: 100 },
      { totalIn: 10, totalOut: 5, cacheRead: 0, cacheCreation: 100 },
      { totalIn: 10, totalOut: 5, cacheRead: 0, cacheCreation: 100 },
    ];
    // No usage above auto threshold and few tool_results — but reactive trigger fires.
    const result = decideCompact(state([tr("a")]), undefined, history);
    expect(result).toBe("reactive");
  });
});
