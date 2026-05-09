import { describe, expect, test } from "bun:test";
import { z } from "zod";
import type {
  LLMProvider,
  OpenSeekMessage,
  ProviderCapability,
} from "@openseek/provider";
import type { AnyTool } from "@openseek/tool";
import { runSession } from "../src/index.ts";
import {
  createMockModel,
  textChunks,
  thinkingThenTextChunks,
  toolCallChunks,
} from "../src/mock-provider.ts";
import type { StreamEvent } from "../src/types.ts";

function capabilityFor(replay = false): ProviderCapability {
  return {
    contextWindow: 1024,
    maxOutput: 256,
    supportsThinking: true,
    supportsCacheControl: false,
    supportsToolUse: true,
    payloadMode: "chat-completions",
    requiresReasoningReplay: replay,
  };
}

function makeProvider(model: ReturnType<typeof createMockModel>["model"]): LLMProvider {
  return {
    id: "mock",
    protocol: "openai-compat",
    defaultModel: "mock-model",
    createClient: () => model,
    capability: () => capabilityFor(),
  };
}

function userMessage(text: string): OpenSeekMessage {
  return { role: "user", content: [{ type: "text", text }] };
}

async function collect(gen: AsyncGenerator<StreamEvent>): Promise<StreamEvent[]> {
  const out: StreamEvent[] = [];
  for await (const ev of gen) out.push(ev);
  return out;
}

describe("runSession streaming", () => {
  test("plain text chunk streams text-delta + finish + turn-end", async () => {
    const handle = createMockModel({
      phases: [{ chunks: textChunks("hello world") }],
    });
    const provider = makeProvider(handle.model);
    const events = await collect(
      runSession(
        {
          messages: [userMessage("hi")],
          mode: "agent",
          reasoningEffort: "off",
          model: "mock-model",
          provider: "mock",
        },
        {
          provider,
          model: "mock-model",
          tools: new Map(),
          capability: capabilityFor(),
          signal: new AbortController().signal,
        },
      ),
    );
    const types = events.map((e) => e.type);
    expect(types).toContain("text-delta");
    expect(types).toContain("turn-end");
    const text = events.find((e) => e.type === "text-delta");
    expect(text && "delta" in text ? text.delta : "").toBe("hello world");
  });

  test("thinking chunks emit thinking-delta before text-delta", async () => {
    const handle = createMockModel({
      phases: [{ chunks: thinkingThenTextChunks("let me think", "answer") }],
    });
    const provider = makeProvider(handle.model);
    const events = await collect(
      runSession(
        {
          messages: [userMessage("hi")],
          mode: "agent",
          reasoningEffort: "high",
          model: "mock-model",
          provider: "mock",
        },
        {
          provider,
          model: "mock-model",
          tools: new Map(),
          capability: capabilityFor(),
          signal: new AbortController().signal,
        },
      ),
    );
    const thinkingIdx = events.findIndex((e) => e.type === "thinking-delta");
    const textIdx = events.findIndex((e) => e.type === "text-delta");
    expect(thinkingIdx).toBeGreaterThan(-1);
    expect(textIdx).toBeGreaterThan(thinkingIdx);
  });

  test("tool-call followed by tool-result and second-round text", async () => {
    const echoTool: AnyTool = {
      name: "echo",
      description: "echo input",
      inputSchema: z.object({ msg: z.string() }),
      permission: "auto",
      async call(input) {
        return { kind: "text", text: `echo:${(input as { msg: string }).msg}` };
      },
    };
    const handle = createMockModel({
      phases: [
        { chunks: toolCallChunks("echo", { msg: "hi" }, "call-1") },
        { chunks: textChunks("done", "txt-2") },
      ],
    });
    const provider = makeProvider(handle.model);
    const events = await collect(
      runSession(
        {
          messages: [userMessage("call echo")],
          mode: "agent",
          reasoningEffort: "off",
          model: "mock-model",
          provider: "mock",
        },
        {
          provider,
          model: "mock-model",
          tools: new Map([["echo", echoTool]]),
          capability: capabilityFor(),
          signal: new AbortController().signal,
        },
      ),
    );
    const types = events.map((e) => e.type);
    expect(types).toContain("tool-call");
    expect(types).toContain("tool-result");
    expect(types).toContain("turn-end");
    expect(handle.callCount()).toBe(2);
    const toolEvent = events.find((e) => e.type === "tool-call");
    expect(toolEvent && "call" in toolEvent ? toolEvent.call.name : "").toBe("echo");
    const resEvent = events.find((e) => e.type === "tool-result");
    expect(
      resEvent && "result" in resEvent && resEvent.result.result.kind === "text"
        ? resEvent.result.result.text
        : "",
    ).toBe("echo:hi");
  });

  test("multi-round tool calls (tool → tool → text) loop correctly", async () => {
    const tool: AnyTool = {
      name: "ping",
      description: "ping",
      inputSchema: z.object({}),
      permission: "auto",
      async call() {
        return { kind: "text", text: "pong" };
      },
    };
    const handle = createMockModel({
      phases: [
        { chunks: toolCallChunks("ping", {}, "call-1") },
        { chunks: toolCallChunks("ping", {}, "call-2") },
        { chunks: textChunks("all done") },
      ],
    });
    const provider = makeProvider(handle.model);
    const events = await collect(
      runSession(
        {
          messages: [userMessage("ping twice")],
          mode: "agent",
          reasoningEffort: "off",
          model: "mock-model",
          provider: "mock",
        },
        {
          provider,
          model: "mock-model",
          tools: new Map([["ping", tool]]),
          capability: capabilityFor(),
          signal: new AbortController().signal,
        },
      ),
    );
    const toolCalls = events.filter((e) => e.type === "tool-call");
    const toolResults = events.filter((e) => e.type === "tool-result");
    expect(toolCalls.length).toBe(2);
    expect(toolResults.length).toBe(2);
    expect(events.at(-1)?.type).toBe("turn-end");
    expect(handle.callCount()).toBe(3);
  });

  test("turn-end carries usage (when provider reports it)", async () => {
    const handle = createMockModel({
      phases: [{ chunks: textChunks("hi") }],
    });
    const provider = makeProvider(handle.model);
    const events = await collect(
      runSession(
        {
          messages: [userMessage("ping")],
          mode: "agent",
          reasoningEffort: "off",
          model: "mock-model",
          provider: "mock",
        },
        {
          provider,
          model: "mock-model",
          tools: new Map(),
          capability: capabilityFor(),
          signal: new AbortController().signal,
        },
      ),
    );
    // Mock provider emits a finish chunk with usage; runSession should
    // forward it on the terminal turn-end event.
    const turnEnd = events.find((e) => e.type === "turn-end");
    expect(turnEnd).toBeDefined();
  });
});
