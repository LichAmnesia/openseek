// End-to-end integration: real mikan provider config + real read tool +
// scripted mock model. Exercises convertToAiSdk + replayReasoning +
// runSession + ToolContext injection in one path.

import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, test } from "bun:test";
import type { LLMProvider, OpenSeekMessage } from "@openseek/provider";
import { mikanProvider } from "@openseek/provider";
import { read as readTool } from "@openseek/tool";
import { runSession } from "../src/index.ts";
import { createMockModel, textChunks, toolCallChunks } from "../src/mock-provider.ts";
import type { StreamEvent } from "../src/types.ts";

function provider(model: ReturnType<typeof createMockModel>["model"]): LLMProvider {
  // Wrap the real mikan provider but override createClient to return our mock.
  // This validates capability + id wiring without hitting the network.
  return {
    ...mikanProvider,
    createClient: () => model,
  };
}

function user(text: string): OpenSeekMessage {
  return { role: "user", content: [{ type: "text", text }] };
}

async function collect(gen: AsyncGenerator<StreamEvent>): Promise<StreamEvent[]> {
  const out: StreamEvent[] = [];
  for await (const ev of gen) out.push(ev);
  return out;
}

describe("integration: mikan + mock LM", () => {
  test("plain hello text round-trips end-to-end", async () => {
    const handle = createMockModel({ phases: [{ chunks: textChunks("hello back") }] });
    const events = await collect(
      runSession(
        {
          messages: [user("hi")],
          mode: "agent",
          reasoningEffort: "off",
          model: "deepseek-chat",
          provider: "mikan",
        },
        {
          provider: provider(handle.model),
          model: "deepseek-chat",
          tools: new Map(),
          capability: mikanProvider.capability("deepseek-chat"),
          signal: new AbortController().signal,
        },
      ),
    );
    const text = events.find((e) => e.type === "text-delta");
    expect(text && "delta" in text ? text.delta : "").toBe("hello back");
    expect(events.at(-1)?.type).toBe("turn-end");
  });

  test("thinking + tool_call + read tool + second-round text", async () => {
    // Set up a real file the read tool will load.
    const dir = mkdtempSync(join(tmpdir(), "openseek-session-"));
    const file = join(dir, "hello.txt");
    writeFileSync(file, "from disk\n");

    const handle = createMockModel({
      phases: [
        // Round 1: thinking + tool call
        {
          chunks: [
            { type: "stream-start", warnings: [] },
            { type: "reasoning-start", id: "r1" },
            { type: "reasoning-delta", id: "r1", delta: "I should read the file" },
            { type: "reasoning-end", id: "r1" },
            ...toolCallChunks("read", { path: file }, "call-1").slice(1),
          ],
        },
        // Round 2: model summarizes
        { chunks: textChunks("file says from disk") },
      ],
    });

    const events = await collect(
      runSession(
        {
          messages: [user("read it")],
          mode: "agent",
          reasoningEffort: "high",
          model: "deepseek-chat",
          provider: "mikan",
        },
        {
          provider: provider(handle.model),
          model: "deepseek-chat",
          tools: new Map([["read", readTool]]),
          capability: mikanProvider.capability("deepseek-chat"),
          signal: new AbortController().signal,
          cwd: dir,
        },
      ),
    );

    const types = events.map((e) => e.type);
    expect(types).toContain("thinking-delta");
    expect(types).toContain("tool-call");
    expect(types).toContain("tool-result");
    expect(types).toContain("text-delta");
    expect(types).toContain("turn-end");

    const toolResult = events.find((e) => e.type === "tool-result");
    if (toolResult && toolResult.type === "tool-result") {
      expect(toolResult.result.result.kind).toBe("text");
      if (toolResult.result.result.kind === "text") {
        expect(toolResult.result.result.text).toContain("from disk");
      }
    }
  });

  test("mid-stream cancel surfaces partial assistant message", async () => {
    const handle = createMockModel({
      phases: [{ chunks: textChunks("partial answer that...") }],
    });
    const ac = new AbortController();
    const events: StreamEvent[] = [];
    for await (const ev of runSession(
      {
        messages: [user("hi")],
        mode: "agent",
        reasoningEffort: "off",
        model: "deepseek-chat",
        provider: "mikan",
      },
      {
        provider: provider(handle.model),
        model: "deepseek-chat",
        tools: new Map(),
        capability: mikanProvider.capability("deepseek-chat"),
        signal: ac.signal,
      },
    )) {
      events.push(ev);
      if (ev.type === "text-delta") ac.abort();
    }
    const cancelled = events.find((e) => e.type === "cancelled");
    expect(cancelled).toBeDefined();
    // Reasonable post-condition: turn-end either absent or after cancelled.
    expect(events.at(-1)?.type === "turn-end" || events.at(-1)?.type === "cancelled").toBe(true);
  });
});
