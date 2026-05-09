// e2e: LSP probe flow (G7.2 #7).
// After an edit-family tool resolves, runSession appends an LSP system
// message; non-edit tools never trigger a probe.

import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, test } from "bun:test";
import { z } from "zod";
import type { LspDiagnostic, LspRouter } from "@openseek/lsp";
import type { AnyTool } from "@openseek/tool";
import { runSession } from "@openseek/session";
import {
  capability,
  createMockModel,
  fakeProvider,
  textChunks,
  toolCallChunks,
  userMsg,
} from "./_harness.ts";

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

const fakeEditTool: AnyTool = {
  name: "edit",
  description: "fake",
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

describe("e2e: LSP flow", () => {
  test("edit tool triggers LSP probe and appends a system message with diagnostics", async () => {
    const dir = mkdtempSync(join(tmpdir(), "openseek-e2e-lsp-"));
    try {
      writeFileSync(join(dir, "broken.ts"), "x");
      const { router, calls } = fakeRouter([
        {
          file: "broken.ts",
          line: 7,
          col: 2,
          severity: "error",
          message: "explode",
          source: "tsc TS9999",
        },
      ]);
      const handle = createMockModel({
        phases: [
          {
            chunks: toolCallChunks(
              "edit",
              { path: "broken.ts", old_string: "a", new_string: "b" },
              "c1",
            ),
          },
          { chunks: textChunks("ok") },
        ],
      });
      const state = {
        messages: [userMsg("edit it")],
        mode: "agent" as const,
        reasoningEffort: "off" as const,
        model: "mock",
        provider: "mock",
      };
      for await (const _ev of runSession(state, {
        provider: fakeProvider(handle.model),
        model: "mock",
        tools: new Map([["edit", fakeEditTool]]),
        capability: capability(),
        signal: new AbortController().signal,
        cwd: dir,
        lspRouter: router,
      })) {
        // drain
      }
      expect(calls).toEqual(["broken.ts"]);
      const sys = state.messages.find((m) => m.role === "system");
      expect(sys).toBeDefined();
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  test("non-edit tool path leaves messages untouched (no LSP injection)", async () => {
    const { router, calls } = fakeRouter([]);
    const pingTool: AnyTool = {
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
        { chunks: toolCallChunks("ping", {}, "p1") },
        { chunks: textChunks("ok") },
      ],
    });
    const state = {
      messages: [userMsg("ping")],
      mode: "agent" as const,
      reasoningEffort: "off" as const,
      model: "mock",
      provider: "mock",
    };
    for await (const _ev of runSession(state, {
      provider: fakeProvider(handle.model),
      model: "mock",
      tools: new Map([["ping", pingTool]]),
      capability: capability(),
      signal: new AbortController().signal,
      lspRouter: router,
    })) {
      // drain
    }
    expect(calls).toEqual([]);
    expect(state.messages.find((m) => m.role === "system")).toBeUndefined();
  });
});
