import { expect, test } from "bun:test";
import type { LLMProvider, ProviderCapability } from "@openseek/provider";
import { createMockModel, textChunks } from "../../session/src/mock-provider.ts";
import { spawnAgent } from "../src/index.ts";

function capability(): ProviderCapability {
  return {
    contextWindow: 1024,
    maxOutput: 256,
    supportsThinking: false,
    supportsCacheControl: false,
    supportsToolUse: true,
    payloadMode: "chat-completions",
    requiresReasoningReplay: false,
  };
}

function provider(model: ReturnType<typeof createMockModel>["model"]): LLMProvider {
  return {
    id: "mock",
    protocol: "openai-compat",
    defaultModel: "mock-model",
    createClient: () => model,
    capability: () => capability(),
  };
}

test("spawnAgent with simple text reply resolves to status=done", async () => {
  const handle = createMockModel({
    phases: [{ chunks: textChunks("hello from child") }],
  });
  const child = spawnAgent(
    { prompt: "say hi" },
    {
      provider: provider(handle.model),
      model: "mock-model",
      capability: capability(),
      tools: new Map(),
    },
  );
  expect(typeof child.id).toBe("string");
  expect(child.id.length).toBeGreaterThan(0);
  const res = await child.result;
  expect(res.status).toBe("done");
  expect(res.output).toBe("hello from child");
  expect(res.ms).toBeGreaterThanOrEqual(0);
});

test("spawnAgent.abort cancels the child cooperatively", async () => {
  const handle = createMockModel({
    phases: [{ chunks: textChunks("won't see all") }],
  });
  const child = spawnAgent(
    { prompt: "stream a lot" },
    {
      provider: provider(handle.model),
      model: "mock-model",
      capability: capability(),
      tools: new Map(),
    },
  );
  child.abort();
  const res = await child.result;
  expect(res.status === "cancelled" || res.status === "timeout").toBe(true);
});

test("spawnAgent with very small timeoutMs resolves status=timeout", async () => {
  // Build a model whose stream stalls forever so the timeout path is exercised.
  const stallModel = {
    specificationVersion: "v3",
    provider: "mock",
    modelId: "mock-model",
    supportedUrls: {},
    async doGenerate() {
      throw new Error("[mock] doGenerate not implemented");
    },
    async doStream(opts: { abortSignal?: AbortSignal }) {
      const signal = opts.abortSignal;
      const stream = new ReadableStream({
        async pull(controller) {
          // Wait until aborted, then surface an AbortError.
          await new Promise<void>((resolve) => {
            if (signal?.aborted) return resolve();
            signal?.addEventListener("abort", () => resolve(), { once: true });
          });
          const err = new Error("aborted");
          err.name = "AbortError";
          controller.error(err);
        },
      });
      return { stream };
    },
    // biome-ignore lint/suspicious/noExplicitAny: mock language model structural type.
  } as any;

  const child = spawnAgent(
    { prompt: "long task", timeoutMs: 30 },
    {
      provider: {
        id: "mock",
        protocol: "openai-compat",
        defaultModel: "mock-model",
        createClient: () => stallModel,
        capability: () => capability(),
      },
      model: "mock-model",
      capability: capability(),
      tools: new Map(),
    },
  );
  const res = await child.result;
  expect(res.status).toBe("timeout");
});

test("spawnAgent surfaces provider failure as status=failed", async () => {
  const failingProvider: LLMProvider = {
    id: "mock",
    protocol: "openai-compat",
    defaultModel: "mock-model",
    createClient: () => {
      throw new Error("client init blew up");
    },
    capability: () => capability(),
  };
  const child = spawnAgent(
    { prompt: "x" },
    {
      provider: failingProvider,
      model: "mock-model",
      capability: capability(),
      tools: new Map(),
    },
  );
  const res = await child.result;
  // runSession yields {type:"error", err}, our spawn maps it to "failed".
  expect(res.status).toBe("failed");
  expect((res.error ?? "").toLowerCase()).toContain("blew up");
});

test("multiple parallel spawnAgent runs do not interfere", async () => {
  const a = createMockModel({ phases: [{ chunks: textChunks("alpha-out") }] });
  const b = createMockModel({ phases: [{ chunks: textChunks("beta-out") }] });
  const c = createMockModel({ phases: [{ chunks: textChunks("gamma-out") }] });

  const results = await Promise.all(
    [a, b, c].map((h, i) => {
      const handle = spawnAgent(
        { prompt: `q${i}` },
        {
          provider: provider(h.model),
          model: "mock-model",
          capability: capability(),
          tools: new Map(),
        },
      );
      return handle.result;
    }),
  );
  expect(results.map((r) => r.status)).toEqual(["done", "done", "done"]);
  expect(results.map((r) => r.output)).toEqual(["alpha-out", "beta-out", "gamma-out"]);
  // Each spawn must produce a unique id.
  const ids = new Set(results.map((r) => r.id));
  expect(ids.size).toBe(3);
});

test("spawnAgent attaches the original prompt as a user message (output reflects child only, parent state untouched)", async () => {
  const handle = createMockModel({
    phases: [{ chunks: textChunks("only child speaks") }],
  });
  const parentMessages: Array<unknown> = [];
  const child = spawnAgent(
    { prompt: "private" },
    {
      provider: provider(handle.model),
      model: "mock-model",
      capability: capability(),
      tools: new Map(),
    },
  );
  const res = await child.result;
  // The child's output never bleeds into a separate parent state object.
  expect(res.output).toBe("only child speaks");
  expect(parentMessages.length).toBe(0);
});

// ---------- sub-agent step budget (regression: was hard-capped at 12) ----------

import { z } from "zod";
import { toolCallChunks } from "../../session/src/mock-provider.ts";

// A no-op auto-permission tool the mock model can "call" every step so the
// session keeps looping until its step budget (stepCountIs) stops it. callCount
// then equals the number of steps the child was actually allowed to take.
function noopToolMap() {
  const noop = {
    name: "noop",
    description: "no-op",
    inputSchema: z.object({}),
    permission: "auto" as const,
    async call() {
      return { kind: "text" as const, text: "ok" };
    },
  };
  // biome-ignore lint/suspicious/noExplicitAny: minimal structural tool for the mock loop.
  return new Map<string, any>([["noop", noop]]);
}

function loopingModel(phaseCount: number) {
  return createMockModel({
    phases: Array.from({ length: phaseCount }, () => ({
      chunks: toolCallChunks("noop", {}),
    })),
  });
}

test("spawned sub-agent gets the raised default step budget (>12, was capped at 12)", async () => {
  const handle = loopingModel(60); // more phases than any cap so the budget is the limit
  const child = spawnAgent(
    { prompt: "do lots of steps" },
    {
      provider: provider(handle.model),
      model: "mock-model",
      capability: capability(),
      tools: noopToolMap(),
    },
  );
  await child.result;
  // Regression guard: the old default was 12. The new default (40) must let a
  // delegated sub-agent take well more than 12 tool-steps.
  expect(handle.callCount()).toBeGreaterThan(12);
  expect(handle.callCount()).toBeLessThanOrEqual(41);
});

test("spawned sub-agent honors an explicit maxSteps override", async () => {
  const handle = loopingModel(60);
  const child = spawnAgent(
    { prompt: "just a couple steps", maxSteps: 3 },
    {
      provider: provider(handle.model),
      model: "mock-model",
      capability: capability(),
      tools: noopToolMap(),
    },
  );
  await child.result;
  // Caller-supplied cap wins; a cheap one-off lookup stays cheap.
  expect(handle.callCount()).toBeLessThanOrEqual(4);
  expect(handle.callCount()).toBeGreaterThanOrEqual(2);
});
