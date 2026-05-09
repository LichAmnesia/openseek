// G2.5: end-to-end check that runSession actually filters the tool set it
// hands to the provider, not just at the registry layer. We capture the
// `tools` ai-SDK passes to `streamText` indirectly: a deny-in-plan tool
// should never be invoked when the model tries to call it under plan mode.

import { describe, expect, test } from "bun:test";
import { z } from "zod";
import type { LLMProvider, OpenSeekMessage, ProviderCapability } from "@openseek/provider";
import type { AnyTool, ToolMode } from "@openseek/tool";
import { runSession } from "../src/index.ts";
import { createMockModel, textChunks, toolCallChunks } from "../src/mock-provider.ts";
import type { StreamEvent } from "../src/types.ts";

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

function makeWriter(callLog: string[]): AnyTool {
  return {
    name: "write",
    description: "would mutate disk",
    inputSchema: z.object({ path: z.string() }),
    permission: "deny-in-plan",
    async call(input) {
      callLog.push((input as { path: string }).path);
      return { kind: "text", text: "wrote" };
    },
  };
}

function makeReader(callLog: string[]): AnyTool {
  return {
    name: "read",
    description: "read",
    inputSchema: z.object({ path: z.string() }),
    permission: "auto",
    async call(input) {
      callLog.push((input as { path: string }).path);
      return { kind: "text", text: "ok" };
    },
  };
}

async function collect(gen: AsyncGenerator<StreamEvent>): Promise<StreamEvent[]> {
  const out: StreamEvent[] = [];
  for await (const ev of gen) out.push(ev);
  return out;
}

async function runWith(
  mode: ToolMode,
  log: string[],
  approveToolCall?: Parameters<typeof runSession>[1]["approveToolCall"],
): Promise<StreamEvent[]> {
  const writer = makeWriter(log);
  const reader = makeReader(log);
  // Plan-mode: model attempts to call `write` (which won't be exposed), so
  // ai-SDK reports a tool-error (unknown tool) — we still complete the turn.
  // Agent/YOLO: write is exposed and executes normally.
  const handle = createMockModel({
    phases: [
      { chunks: toolCallChunks("write", { path: "x.ts" }, "call-1") },
      { chunks: textChunks("done") },
    ],
  });
  const provider = makeProvider(handle.model);
  return await collect(
    runSession(
      {
        messages: [userMessage("write x")],
        mode,
        reasoningEffort: "off",
        model: "mock-model",
        provider: "mock",
      },
      {
        provider,
        model: "mock-model",
        tools: new Map([
          ["write", writer],
          ["read", reader],
        ]),
        capability: capabilityFor(),
        signal: new AbortController().signal,
        approveToolCall,
      },
    ),
  );
}

describe("runSession mode-gate", () => {
  test("plan mode never executes a deny-in-plan tool", async () => {
    const log: string[] = [];
    await runWith("plan", log);
    // The writer's call() is the source of truth — it must not have run.
    expect(log).not.toContain("x.ts");
  });

  test("agent mode executes the tool normally", async () => {
    const log: string[] = [];
    const events = await runWith("agent", log);
    expect(log).toContain("x.ts");
    expect(events.some((e) => e.type === "tool-result")).toBe(true);
  });

  test("agent mode can deny a side-effect tool through approval hook", async () => {
    const log: string[] = [];
    const approvals: string[] = [];
    const events = await runWith("agent", log, async (req) => {
      approvals.push(`${req.name}:${req.permission}`);
      return false;
    });
    expect(approvals).toEqual(["write:deny-in-plan"]);
    expect(log).not.toContain("x.ts");
    expect(
      events.some(
        (e) =>
          e.type === "tool-result" &&
          e.result.result.kind === "error" &&
          e.result.result.message.includes("denied"),
      ),
    ).toBe(true);
  });

  test("yolo mode also executes the tool normally", async () => {
    const log: string[] = [];
    const events = await runWith("yolo", log);
    expect(log).toContain("x.ts");
    expect(events.some((e) => e.type === "tool-result")).toBe(true);
  });
});
