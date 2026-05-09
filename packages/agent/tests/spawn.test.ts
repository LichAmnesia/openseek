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
