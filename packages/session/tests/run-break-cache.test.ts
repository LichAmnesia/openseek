// T1 — /break-cache: when SessionState.breakCache=true, runSession must
// strip Anthropic-style `cache_control` breakpoints from the outbound
// payload so the next provider request misses prompt cache by design.
//
// Cache_control is not part of the typed ContentBlock union (it lives only
// on the protocol-shim's AnthropicTextBlock type). We test BOTH layers:
//
//   1. End-to-end: runSession with breakCache=true completes without
//      tripping any error AND the SessionState surface accepts the flag.
//   2. Unit: the exported `stripCacheControl` helper removes the field
//      from every block — defensive against future shim code that auto-
//      injects breakpoints onto outbound text blocks.

import { expect, test } from "bun:test";
import type { LLMProvider, OpenSeekMessage, ProviderCapability } from "@openseek/provider";
import { runSession } from "../src/index.ts";
import { createMockModel, textChunks } from "../src/mock-provider.ts";
import { stripCacheControl } from "../src/run.ts";
import type { StreamEvent } from "../src/types.ts";

function capability(): ProviderCapability {
  return {
    contextWindow: 1024,
    maxOutput: 256,
    supportsThinking: false,
    supportsCacheControl: true,
    supportsToolUse: false,
    payloadMode: "anthropic-messages",
    requiresReasoningReplay: false,
  };
}

function provider(model: ReturnType<typeof createMockModel>["model"]): LLMProvider {
  return {
    id: "mock-anthropic",
    protocol: "anthropic",
    defaultModel: "mock-model",
    createClient: () => model,
    capability,
  };
}

async function drain(gen: AsyncGenerator<StreamEvent>): Promise<StreamEvent[]> {
  const out: StreamEvent[] = [];
  for await (const ev of gen) out.push(ev);
  return out;
}

function userMsg(text: string): OpenSeekMessage {
  return { role: "user", content: [{ type: "text", text }] };
}

function userMsgWithBreakpoint(text: string): OpenSeekMessage {
  // Smuggle cache_control onto a text block via cast — mirrors what a
  // future shim auto-injection codepath could do.
  return {
    role: "user",
    content: [
      // biome-ignore lint/suspicious/noExplicitAny: deliberate smuggling.
      { type: "text", text, cache_control: { type: "ephemeral" } } as any,
    ],
  };
}

test("stripCacheControl removes the field from every block (T1 unit)", () => {
  const msg = userMsgWithBreakpoint("hi");
  const out = stripCacheControl(msg);
  for (const block of out.content) {
    expect("cache_control" in (block as Record<string, unknown>)).toBe(false);
  }
});

test("stripCacheControl preserves all other block fields (T1 unit)", () => {
  const msg = userMsgWithBreakpoint("payload");
  const out = stripCacheControl(msg);
  expect(out.role).toBe("user");
  expect(out.content[0]).toMatchObject({ type: "text", text: "payload" });
});

test("breakCache=true completes a turn end-to-end without error (T1 e2e)", async () => {
  const handle = createMockModel({ phases: [{ chunks: textChunks("ok") }] });
  const events = await drain(
    runSession(
      {
        messages: [userMsg("hello"), userMsgWithBreakpoint("more")],
        mode: "agent",
        reasoningEffort: "off",
        model: "mock-model",
        provider: "mock-anthropic",
        breakCache: true,
      },
      {
        provider: provider(handle.model),
        model: "mock-model",
        tools: new Map(),
        capability: capability(),
        signal: new AbortController().signal,
      },
    ),
  );
  // Turn completes successfully (no error event) — proves the strip path
  // doesn't break wire-message conversion when breakCache is set.
  expect(events.some((e) => e.type === "turn-end")).toBe(true);
  expect(events.some((e) => e.type === "error")).toBe(false);
});

test("breakCache absent: turn still completes (T1 control)", async () => {
  // Control: smuggled cache_control field doesn't crash the normal path.
  const handle = createMockModel({ phases: [{ chunks: textChunks("ok") }] });
  const events = await drain(
    runSession(
      {
        messages: [userMsgWithBreakpoint("hello")],
        mode: "agent",
        reasoningEffort: "off",
        model: "mock-model",
        provider: "mock-anthropic",
      },
      {
        provider: provider(handle.model),
        model: "mock-model",
        tools: new Map(),
        capability: capability(),
        signal: new AbortController().signal,
      },
    ),
  );
  expect(events.some((e) => e.type === "turn-end")).toBe(true);
});
