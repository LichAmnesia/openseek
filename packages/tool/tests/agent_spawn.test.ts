import { afterEach, beforeEach, expect, test } from "bun:test";
import type { LLMProvider, ProviderCapability } from "@openseek/provider";
import { createMockModel, textChunks } from "../../session/src/mock-provider.ts";
import agentSpawn, { setAgentSpawnDeps } from "../src/tools/agent_spawn.ts";
import { cleanupTmpDir, makeCtx, makeTmpDir } from "./helpers.ts";

let cwd: string;

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

beforeEach(() => {
  cwd = makeTmpDir("openseek-agent-spawn-");
});

afterEach(() => {
  cleanupTmpDir(cwd);
  setAgentSpawnDeps(undefined);
});

test("agent_spawn errors clearly when deps are not configured", async () => {
  const result = await agentSpawn.call({ prompt: "do a thing" }, makeCtx(cwd));
  expect(result.kind).toBe("error");
  if (result.kind !== "error") throw new Error("unreachable");
  expect(result.message).toContain("agent_spawn deps not configured");
});

test("agent_spawn forks a child session and embeds its output in the result", async () => {
  const handle = createMockModel({ phases: [{ chunks: textChunks("child says hi") }] });
  setAgentSpawnDeps({
    provider: provider(handle.model),
    model: "mock-model",
    capability: capability(),
    tools: new Map(),
  });
  const result = await agentSpawn.call(
    { prompt: "Investigate the failing migration test" },
    makeCtx(cwd),
  );
  expect(result.kind).toBe("text");
  if (result.kind !== "text") throw new Error("unreachable");
  expect(result.text).toContain("sub-agent");
  expect(result.text).toContain("status=done");
  expect(result.text).toContain("child says hi");
  expect(result.text).toContain("Investigate the failing migration test");
});

test("agent_spawn propagates parent abort to the child (status=cancelled or timeout)", async () => {
  // Stalling model so the only way out is via abort.
  const stallModel = {
    specificationVersion: "v3",
    provider: "mock",
    modelId: "mock-model",
    supportedUrls: {},
    async doGenerate() {
      throw new Error("nope");
    },
    async doStream(opts: { abortSignal?: AbortSignal }) {
      const sig = opts.abortSignal;
      const stream = new ReadableStream({
        async pull(controller) {
          await new Promise<void>((resolve) => {
            if (sig?.aborted) return resolve();
            sig?.addEventListener("abort", () => resolve(), { once: true });
          });
          const err = new Error("aborted");
          err.name = "AbortError";
          controller.error(err);
        },
      });
      return { stream };
    },
    // biome-ignore lint/suspicious/noExplicitAny: structural mock type.
  } as any;
  setAgentSpawnDeps({
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
  });

  const ac = new AbortController();
  // Abort right after the call dispatches.
  setTimeout(() => ac.abort(), 5);
  const ctx = makeCtx(cwd, { abort: ac.signal });
  const result = await agentSpawn.call({ prompt: "long task" }, ctx);
  expect(result.kind).toBe("text");
  if (result.kind !== "text") throw new Error("unreachable");
  // status reflects cooperative cancellation triggered by the parent signal.
  expect(result.text).toMatch(/status=(cancelled|timeout)/);
});

test("agent_spawn timeoutMs hard-stops a stalled child", async () => {
  const stallModel = {
    specificationVersion: "v3",
    provider: "mock",
    modelId: "mock-model",
    supportedUrls: {},
    async doGenerate() {
      throw new Error("nope");
    },
    async doStream(opts: { abortSignal?: AbortSignal }) {
      const sig = opts.abortSignal;
      const stream = new ReadableStream({
        async pull(controller) {
          await new Promise<void>((resolve) => {
            if (sig?.aborted) return resolve();
            sig?.addEventListener("abort", () => resolve(), { once: true });
          });
          const err = new Error("aborted");
          err.name = "AbortError";
          controller.error(err);
        },
      });
      return { stream };
    },
    // biome-ignore lint/suspicious/noExplicitAny: structural mock type.
  } as any;
  setAgentSpawnDeps({
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
  });
  const result = await agentSpawn.call({ prompt: "task", timeoutMs: 30 }, makeCtx(cwd));
  if (result.kind !== "text") throw new Error("unreachable");
  expect(result.text).toContain("status=timeout");
});

test("agent_spawn respects model override per call", async () => {
  const handle = createMockModel({ phases: [{ chunks: textChunks("ok") }] });
  let modelSeen: string | undefined;
  const customProvider: LLMProvider = {
    id: "mock",
    protocol: "openai-compat",
    defaultModel: "mock-model",
    createClient: (modelId) => {
      modelSeen = modelId;
      return handle.model;
    },
    capability: () => capability(),
  };
  setAgentSpawnDeps({
    provider: customProvider,
    model: "default-model",
    capability: capability(),
    tools: new Map(),
  });
  await agentSpawn.call({ prompt: "x", model: "override-model" }, makeCtx(cwd));
  expect(modelSeen).toBe("override-model");
});
