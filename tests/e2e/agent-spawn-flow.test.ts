// e2e: agent_spawn (G7.2 #9).

import { describe, expect, test } from "bun:test";
import { spawnAgent } from "@openseek/agent";
import {
  capability,
  createMockModel,
  fakeProvider,
  textChunks,
} from "./_harness.ts";

describe("e2e: agent-spawn flow", () => {
  test("child runs to completion with status=done and output text", async () => {
    const handle = createMockModel({
      phases: [{ chunks: textChunks("hello from child") }],
    });
    const child = spawnAgent(
      { prompt: "say hi" },
      {
        provider: fakeProvider(handle.model),
        model: "mock-model",
        capability: capability(),
        tools: new Map(),
      },
    );
    expect(typeof child.id).toBe("string");
    const res = await child.result;
    expect(res.status).toBe("done");
    expect(res.output).toContain("hello from child");
  });

  test("child with very small timeout resolves status=timeout (or cancelled)", async () => {
    // Stall stream forever so timeout fires.
    const stallModel = {
      specificationVersion: "v3",
      provider: "mock",
      modelId: "mock-model",
      supportedUrls: {},
      async doGenerate() {
        throw new Error("stub");
      },
      async doStream(opts: { abortSignal?: AbortSignal }) {
        const stream = new ReadableStream({
          async pull(controller) {
            await new Promise((r) => setTimeout(r, 100));
            if (opts.abortSignal?.aborted) controller.error(new Error("aborted"));
          },
        });
        return { stream };
      },
      // biome-ignore lint/suspicious/noExplicitAny: SDK structural type
    } as any;
    const child = spawnAgent(
      { prompt: "stall", timeoutMs: 30 },
      {
        provider: fakeProvider(stallModel),
        model: "mock-model",
        capability: capability(),
        tools: new Map(),
      },
    );
    const res = await child.result;
    expect(res.status === "timeout" || res.status === "cancelled").toBe(true);
  });
});
