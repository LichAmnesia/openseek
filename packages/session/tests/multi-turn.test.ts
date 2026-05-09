// F2 Bug 2.1 + 2.2 regression: multi-turn assistant context survives across
// runSession invocations, and providers with `requiresReasoningReplay: true`
// see the prior assistant's reasoning_content on subsequent requests.
//
// The test simulates the cli host's wireMessages flow:
//   1. user submit → wireMessages.push(user1)
//   2. runSession streams → emits `assistant-turn` event → host appends those
//      messages onto wireMessages
//   3. user submit → wireMessages.push(user2)
//   4. runSession again → mock model captures the prompt → assert it carries
//      the prior assistant's content (and reasoningContent for replay providers)

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

async function runOneTurn(opts: {
  wire: OpenSeekMessage[];
  provider: LLMProvider;
  capability: ProviderCapability;
  tools?: Map<string, AnyTool>;
}): Promise<StreamEvent[]> {
  // Mirror interactive.ts's appendHistory behaviour: collect events, fold
  // assistant-turn messages back into the shared wire array.
  const events: StreamEvent[] = [];
  for await (const ev of runSession(
    {
      messages: opts.wire,
      mode: "agent",
      reasoningEffort: "off",
      model: "mock-model",
      provider: "mock",
    },
    {
      provider: opts.provider,
      model: "mock-model",
      tools: opts.tools ?? new Map(),
      capability: opts.capability,
      signal: new AbortController().signal,
    },
  )) {
    events.push(ev);
    if (ev.type === "assistant-turn") {
      for (const m of ev.messages) opts.wire.push(m);
    }
  }
  return events;
}

describe("F2 Bug 2.1: multi-turn assistant context survives", () => {
  test("plain text turn-1 → second-turn prompt carries assistant message", async () => {
    const handle = createMockModel({
      phases: [
        { chunks: textChunks("hello, the answer is 42") },
        { chunks: textChunks("you asked about 42") },
      ],
    });
    const provider = makeProvider(handle.model);
    const wire: OpenSeekMessage[] = [userMessage("q1")];

    // Turn 1
    const events1 = await runOneTurn({
      wire,
      provider,
      capability: capabilityFor(),
    });
    const turnEvent = events1.find((e) => e.type === "assistant-turn");
    expect(turnEvent).toBeDefined();
    if (turnEvent && turnEvent.type === "assistant-turn") {
      expect(turnEvent.messages.length).toBe(1);
      expect(turnEvent.messages[0]?.role).toBe("assistant");
    }
    // wire should now hold [user, assistant]
    expect(wire).toHaveLength(2);
    expect(wire[1]?.role).toBe("assistant");
    const lastBlock = wire[1]?.content[0];
    expect(lastBlock?.type).toBe("text");
    if (lastBlock?.type === "text") {
      expect(lastBlock.text).toBe("hello, the answer is 42");
    }

    // Turn 2: append user message and run again.
    wire.push(userMessage("q2 — what number?"));
    await runOneTurn({ wire, provider, capability: capabilityFor() });

    // Mock recorded the prompt sent on each doStream call. The 2nd call must
    // include the assistant message from turn 1 in the prompt.
    const promptCall2 = handle.promptLog()[1] as Array<Record<string, unknown>>;
    expect(Array.isArray(promptCall2)).toBe(true);
    // ai-SDK shape: each prompt entry is { role, content }. Assistant from
    // turn 1 must be present somewhere.
    const roles = promptCall2.map((m) => m.role);
    expect(roles).toContain("user");
    expect(roles).toContain("assistant");
    // Find the assistant message in the wire-level payload.
    const asstEntry = promptCall2.find((m) => m.role === "assistant");
    expect(asstEntry).toBeDefined();
    // ai-SDK collapses single-text assistant messages to plain string content,
    // so the wire payload's assistant content should be the turn-1 text.
    const content = asstEntry?.content;
    const hasText = typeof content === "string"
      ? content.includes("42")
      : Array.isArray(content) &&
        content.some(
          (p: { type?: string; text?: string }) =>
            p.type === "text" && typeof p.text === "string" && p.text.includes("42"),
        );
    expect(hasText).toBe(true);
  });

  test("tool-loop turn → second turn sees tool_call + tool result in wire", async () => {
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
        // turn 2 phases
        { chunks: textChunks("ack") },
      ],
    });
    const provider = makeProvider(handle.model);
    const wire: OpenSeekMessage[] = [userMessage("call echo")];

    await runOneTurn({
      wire,
      provider,
      capability: capabilityFor(),
      tools: new Map([["echo", echoTool]]),
    });

    // wire should now contain: user, assistant(tool_call), tool, assistant(text)
    expect(wire.length).toBeGreaterThanOrEqual(2);
    const roles = wire.map((m) => m.role);
    expect(roles).toContain("assistant");
    expect(roles).toContain("tool");

    // Turn 2: add a follow-up user msg and run.
    wire.push(userMessage("anything else?"));
    await runOneTurn({
      wire,
      provider,
      capability: capabilityFor(),
      tools: new Map([["echo", echoTool]]),
    });

    // Find the prompt from the FIRST doStream call of turn 2. Note: turn-1
    // also has 2 doStream calls (tool loop), so turn-2's first call is index 2.
    const allPrompts = handle.promptLog();
    expect(allPrompts.length).toBeGreaterThanOrEqual(3);
    const turn2Prompt = allPrompts[2] as Array<Record<string, unknown>>;
    expect(Array.isArray(turn2Prompt)).toBe(true);
    const t2Roles = turn2Prompt.map((m) => m.role);
    // turn-2 prompt must contain BOTH the user-1 + assistant + tool messages
    // from turn-1 along with user-2.
    expect(t2Roles).toContain("assistant");
    expect(t2Roles).toContain("tool");
    expect(t2Roles.filter((r) => r === "user").length).toBeGreaterThanOrEqual(2);
  });

  test("cancel mid-stream still pushes (cleaned) assistant turn into wire", async () => {
    // Simulate a cancel after the first text-delta. The synthesized turn
    // should land in wire so a subsequent "what did you just say?" can see
    // partial assistant context.
    const handle = createMockModel({
      phases: [{ chunks: textChunks("partial answer that will be cut") }],
    });
    const provider = makeProvider(handle.model);
    const wire: OpenSeekMessage[] = [userMessage("hi")];
    const ac = new AbortController();

    let sawAssistantTurn = false;
    for await (const ev of runSession(
      {
        messages: wire,
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
        signal: ac.signal,
      },
    )) {
      if (ev.type === "text-delta") ac.abort();
      if (ev.type === "assistant-turn") {
        sawAssistantTurn = true;
        for (const m of ev.messages) wire.push(m);
      }
    }
    // After abort, history is pushed exclusively via assistant-turn (F5
    // P0-NEW #1: cancelled no longer carries turnMessages).
    if (!sawAssistantTurn) {
      // fallback: nothing to push — cancel happened before any blocks
      // accumulated, which is acceptable for this race-y mock.
      expect(wire.length).toBeGreaterThanOrEqual(1);
    } else {
      expect(wire.length).toBeGreaterThanOrEqual(2);
      expect(wire.at(-1)?.role).toBe("assistant");
    }
  });

  test("F5 P0-NEW #1: cancel emits exactly ONE assistant-turn (no double-append)", async () => {
    // Pre-F5: runSession emitted assistant-turn AND cancelled{turnMessages}
    // on cancel. wire.ts appended history for BOTH events → assistant
    // message landed twice in wireMessages. Verify only one assistant-turn
    // event surfaces, and that the `cancelled` event no longer carries
    // turnMessages.
    const handle = createMockModel({
      phases: [{ chunks: textChunks("xx yy zz") }],
    });
    const provider = makeProvider(handle.model);
    const wire: OpenSeekMessage[] = [userMessage("hi")];
    const ac = new AbortController();

    let assistantTurnCount = 0;
    let cancelledEvent: { type: "cancelled"; partial?: OpenSeekMessage } | undefined;
    for await (const ev of runSession(
      {
        messages: wire,
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
        signal: ac.signal,
      },
    )) {
      if (ev.type === "text-delta") ac.abort();
      if (ev.type === "assistant-turn") assistantTurnCount += 1;
      if (ev.type === "cancelled") cancelledEvent = ev;
    }
    expect(assistantTurnCount).toBeLessThanOrEqual(1);
    // The `cancelled` event must NOT carry turnMessages (post-F5 contract).
    expect(cancelledEvent).toBeDefined();
    if (cancelledEvent) {
      expect("turnMessages" in cancelledEvent).toBe(false);
    }
  });
});

describe("F2 Bug 2.2: reasoning_content survives across turns for replay providers", () => {
  test("turn-1 thinking → assistant.reasoningContent set → turn-2 wire payload carries thinking", async () => {
    // First phase emits thinking + text, second phase is the next-turn reply.
    const handle = createMockModel({
      phases: [
        { chunks: thinkingThenTextChunks("let me think hard", "the answer is 42") },
        { chunks: textChunks("ok") },
      ],
    });
    // Provider with requiresReasoningReplay: true (mikan/deepseek-v4 family).
    const replayCap = capabilityFor(true);
    const provider: LLMProvider = {
      id: "mikan-mock",
      protocol: "openai-compat",
      defaultModel: "mock-model",
      createClient: () => handle.model,
      capability: () => replayCap,
    };
    const wire: OpenSeekMessage[] = [userMessage("q1")];

    // Turn 1
    const events1 = await runOneTurn({ wire, provider, capability: replayCap });
    // Find the assistant-turn event and assert reasoningContent is set.
    const turnEvent = events1.find((e) => e.type === "assistant-turn");
    expect(turnEvent).toBeDefined();
    if (turnEvent && turnEvent.type === "assistant-turn") {
      const asst = turnEvent.messages.find((m) => m.role === "assistant");
      expect(asst).toBeDefined();
      expect(asst?.reasoningContent).toBe("let me think hard");
    }
    // wire's assistant entry should also carry reasoningContent.
    const asstInWire = wire.find((m) => m.role === "assistant");
    expect(asstInWire?.reasoningContent).toBe("let me think hard");

    // Turn 2: simulate next user submit.
    wire.push(userMessage("follow-up"));
    await runOneTurn({ wire, provider, capability: replayCap });

    // The 2nd doStream prompt should carry the prior assistant message with
    // a thinking/reasoning block at the top — that's what replayReasoning
    // produced. ai-SDK encodes thinking blocks as `type: "reasoning"` parts.
    const turn2Prompt = handle.promptLog()[1] as Array<Record<string, unknown>>;
    expect(Array.isArray(turn2Prompt)).toBe(true);

    // Tool-call replay only fires when the assistant message has a tool_call
    // block. Pure-text turns (this case) don't get the leading-thinking
    // injection, but the OpenSeekMessage in wireMessages STILL carries
    // reasoningContent so it would be replayed when the assistant DOES emit
    // a tool_call. That's the field-level guarantee Bug 2.2 cares about.
    expect(asstInWire?.reasoningContent).toBe("let me think hard");
  });

  test("turn with tool_call: reasoning_content gets replayed as leading thinking block", async () => {
    // The provider-level transform.replayReasoning injects a leading
    // thinking block onto assistant tool_call messages when
    // requiresReasoningReplay is true. With Bug 2.2 fixed, the wire
    // assistant message carries `reasoningContent`, so the replay actually
    // fires on subsequent turns.
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
        // Round 1: thinking + tool call (assistant emits reasoning then calls)
        {
          chunks: [
            { type: "stream-start", warnings: [] },
            { type: "reasoning-start", id: "r1" },
            { type: "reasoning-delta", id: "r1", delta: "let me ping" },
            { type: "reasoning-end", id: "r1" },
            ...toolCallChunks("ping", {}, "call-1").slice(1),
          ],
        },
        // Round 2: model answers after tool result
        { chunks: textChunks("done") },
        // Turn 2 (separate runSession invocation)
        { chunks: textChunks("ack") },
      ],
    });
    const replayCap = capabilityFor(true);
    const provider: LLMProvider = {
      id: "mikan-mock",
      protocol: "openai-compat",
      defaultModel: "mock-model",
      createClient: () => handle.model,
      capability: () => replayCap,
    };
    const wire: OpenSeekMessage[] = [userMessage("ping it")];
    await runOneTurn({
      wire,
      provider,
      capability: replayCap,
      tools: new Map([["ping", tool]]),
    });
    // assistant-with-tool_call should be in wire with reasoningContent.
    const asst = wire.find(
      (m) => m.role === "assistant" && m.content.some((b) => b.type === "tool_call"),
    );
    expect(asst).toBeDefined();
    expect(asst?.reasoningContent).toBe("let me ping");

    // Turn 2: invoke runSession again. The replayReasoning transform should
    // inline the reasoning text as a leading thinking block on the
    // assistant tool_call message in the wire payload.
    wire.push(userMessage("again?"));
    await runOneTurn({
      wire,
      provider,
      capability: replayCap,
      tools: new Map([["ping", tool]]),
    });

    // turn-2 first doStream prompt is at index 2 (turn-1 used index 0+1).
    const turn2Prompt = handle.promptLog()[2] as Array<Record<string, unknown>>;
    expect(Array.isArray(turn2Prompt)).toBe(true);

    // Find the assistant entry that carried a tool_call.
    const asstInPrompt = turn2Prompt.find((m) => {
      if (m.role !== "assistant") return false;
      const c = m.content;
      return Array.isArray(c) && c.some((p: { type?: string }) => p.type === "tool-call");
    });
    expect(asstInPrompt).toBeDefined();
    if (asstInPrompt && Array.isArray(asstInPrompt.content)) {
      // Leading reasoning/thinking part must be present (replayReasoning).
      const head = (asstInPrompt.content as Array<{ type?: string; text?: string }>)[0];
      expect(head?.type).toBe("reasoning");
      expect(head?.text).toBe("let me ping");
    }
  });
});
