// G2.6: reasoningEffort flows from RunOptions → ai-SDK providerOptions blob,
// and ai-SDK forwards it to the upstream provider's `doStream`.
//
// We intercept providerOptions at the mock model boundary because that is
// what real providers (DeepSeek / OpenAI-compat) consume.

import { describe, expect, test } from "bun:test";
import type { LLMProvider, OpenSeekMessage, ProviderCapability } from "@openseek/provider";
import { runSession } from "../src/index.ts";
import { createMockModel, textChunks } from "../src/mock-provider.ts";
import type { ReasoningEffort, StreamEvent } from "../src/types.ts";

function capabilityFor(): ProviderCapability {
  return {
    contextWindow: 1024,
    maxOutput: 256,
    supportsThinking: true,
    supportsCacheControl: false,
    supportsToolUse: true,
    payloadMode: "chat-completions",
    requiresReasoningReplay: false,
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

async function drain(gen: AsyncGenerator<StreamEvent>): Promise<void> {
  for await (const _ of gen) void _;
}

async function runWithEffort(
  effort: ReasoningEffort,
): Promise<ReturnType<typeof createMockModel>> {
  const handle = createMockModel({ phases: [{ chunks: textChunks("hi") }] });
  const provider = makeProvider(handle.model);
  await drain(
    runSession(
      {
        messages: [userMessage("ping")],
        mode: "agent",
        reasoningEffort: effort,
        model: "mock-model",
        provider: "mock",
      },
      {
        provider,
        model: "mock-model",
        tools: new Map(),
        capability: capabilityFor(),
        signal: new AbortController().signal,
        reasoningEffort: effort,
      },
    ),
  );
  return handle;
}

describe("runSession reasoning-effort passthrough", () => {
  test("effort=off forwards an empty providerOptions blob", async () => {
    const handle = await runWithEffort("off");
    const log = handle.providerOptionsLog();
    expect(log.length).toBe(1);
    const opts = (log[0] as Record<string, unknown> | undefined) ?? {};
    expect(opts.openai).toBeUndefined();
    expect(opts.deepseek).toBeUndefined();
  });

  test("effort=high lands under providerOptions.openai.reasoningEffort", async () => {
    const handle = await runWithEffort("high");
    const opts = handle.providerOptionsLog()[0] as Record<string, Record<string, unknown>>;
    expect(opts.openai?.reasoningEffort).toBe("high");
    expect(opts.deepseek?.reasoningEffort).toBe("high");
  });

  test("effort=max lands under providerOptions.openai.reasoningEffort", async () => {
    const handle = await runWithEffort("max");
    const opts = handle.providerOptionsLog()[0] as Record<string, Record<string, unknown>>;
    expect(opts.openai?.reasoningEffort).toBe("max");
    expect(opts.deepseek?.reasoningEffort).toBe("max");
  });
});
