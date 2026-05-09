import { describe, expect, test } from "bun:test";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { z } from "zod";
import type { LspDiagnostic, LspRouter } from "@openseek/lsp";
import type { LLMProvider, OpenSeekMessage, ProviderCapability } from "@openseek/provider";
import type { AnyTool } from "@openseek/tool";
import { runSession } from "../src/index.ts";
import { createMockModel, textChunks, toolCallChunks } from "../src/mock-provider.ts";
import type { StreamEvent } from "../src/types.ts";

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
    capability,
  };
}

function userMessage(text: string): OpenSeekMessage {
  return { role: "user", content: [{ type: "text", text }] };
}

async function drain(gen: AsyncGenerator<StreamEvent>): Promise<StreamEvent[]> {
  const out: StreamEvent[] = [];
  for await (const ev of gen) out.push(ev);
  return out;
}

function fakeRouter(diags: LspDiagnostic[]): { router: LspRouter; calls: string[] } {
  const calls: string[] = [];
  return {
    calls,
    router: {
      probe: async (file: string) => {
        calls.push(file);
        return diags;
      },
    },
  };
}

// Minimal `edit` tool stand-in that matches the real input shape but doesn't
// require an actual file: we only need the call to resolve non-error so the
// run loop registers the touched path with the lspRouter.
const fakeEditTool: AnyTool = {
  name: "edit",
  description: "fake edit",
  inputSchema: z.object({
    path: z.string(),
    old_string: z.string(),
    new_string: z.string(),
  }),
  permission: "auto",
  async call(input) {
    const { path } = input as { path: string };
    return { kind: "diff", before: "a", after: "b", path };
  },
};

const fakePingTool: AnyTool = {
  name: "ping",
  description: "ping",
  inputSchema: z.object({}),
  permission: "auto",
  async call() {
    return { kind: "text", text: "pong" };
  },
};

describe("runSession + lspRouter (G3.4)", () => {
  test("after edit tool resolves, system message with diagnostics is appended to state.messages", async () => {
    const dir = mkdtempSync(join(tmpdir(), "openseek-run-lsp-"));
    try {
      writeFileSync(join(dir, "broken.ts"), "x");
      const { router, calls } = fakeRouter([
        {
          file: "broken.ts",
          line: 3,
          col: 1,
          severity: "error",
          message: "type mismatch",
          source: "tsc TS2322",
        },
      ]);
      const handle = createMockModel({
        phases: [
          {
            chunks: toolCallChunks(
              "edit",
              { path: "broken.ts", old_string: "a", new_string: "b" },
              "call-1",
            ),
          },
          { chunks: textChunks("done") },
        ],
      });
      const state = {
        messages: [userMessage("edit it")],
        mode: "agent" as const,
        reasoningEffort: "off" as const,
        model: "mock-model",
        provider: "mock",
      };
      await drain(
        runSession(state, {
          provider: provider(handle.model),
          model: "mock-model",
          tools: new Map([["edit", fakeEditTool]]),
          capability: capability(),
          signal: new AbortController().signal,
          cwd: dir,
          lspRouter: router,
        }),
      );
      expect(calls).toEqual(["broken.ts"]);
      const sys = state.messages.find((m) => m.role === "system");
      expect(sys).toBeDefined();
      const text = sys?.content[0]?.type === "text" ? sys.content[0].text : "";
      expect(text).toContain("**LSP**");
      expect(text).toContain("L3:1 error tsc TS2322: type mismatch");
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  test("non-edit tools do NOT trigger an LSP probe", async () => {
    const { router, calls } = fakeRouter([]);
    const handle = createMockModel({
      phases: [
        { chunks: toolCallChunks("ping", {}, "call-1") },
        { chunks: textChunks("ok") },
      ],
    });
    const state = {
      messages: [userMessage("ping")],
      mode: "agent" as const,
      reasoningEffort: "off" as const,
      model: "mock-model",
      provider: "mock",
    };
    await drain(
      runSession(state, {
        provider: provider(handle.model),
        model: "mock-model",
        tools: new Map([["ping", fakePingTool]]),
        capability: capability(),
        signal: new AbortController().signal,
        lspRouter: router,
      }),
    );
    expect(calls).toEqual([]);
    expect(state.messages.find((m) => m.role === "system")).toBeUndefined();
  });

  test("when lspRouter is not provided, edit tools run normally without injection", async () => {
    const handle = createMockModel({
      phases: [
        {
          chunks: toolCallChunks(
            "edit",
            { path: "x.ts", old_string: "a", new_string: "b" },
            "call-1",
          ),
        },
        { chunks: textChunks("done") },
      ],
    });
    const state = {
      messages: [userMessage("edit")],
      mode: "agent" as const,
      reasoningEffort: "off" as const,
      model: "mock-model",
      provider: "mock",
    };
    await drain(
      runSession(state, {
        provider: provider(handle.model),
        model: "mock-model",
        tools: new Map([["edit", fakeEditTool]]),
        capability: capability(),
        signal: new AbortController().signal,
        // no lspRouter
      }),
    );
    expect(state.messages.find((m) => m.role === "system")).toBeUndefined();
  });
});
