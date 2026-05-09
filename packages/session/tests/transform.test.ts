import { describe, expect, test } from "bun:test";
import { z } from "zod";
import type { OpenSeekMessage } from "@openseek/provider";
import type { AnyTool } from "@openseek/tool";
import { convertToAiSdk, convertToolsToAiSdk } from "../src/index.ts";

describe("convertToAiSdk", () => {
  test("maps system + user text-only messages to plain string content", () => {
    const msgs: OpenSeekMessage[] = [
      { role: "system", content: [{ type: "text", text: "you are helpful" }] },
      { role: "user", content: [{ type: "text", text: "hello" }] },
    ];
    const out = convertToAiSdk(msgs);
    expect(out).toEqual([
      { role: "system", content: "you are helpful" },
      { role: "user", content: "hello" },
    ]);
  });

  test("collapses multi-block user content to newline-joined text", () => {
    const msgs: OpenSeekMessage[] = [
      {
        role: "user",
        content: [
          { type: "text", text: "first line" },
          { type: "text", text: "second line" },
        ],
      },
    ];
    const out = convertToAiSdk(msgs);
    expect(out[0]).toEqual({ role: "user", content: "first line\nsecond line" });
  });

  test("assistant text-only message simplifies to string content", () => {
    const msgs: OpenSeekMessage[] = [
      { role: "assistant", content: [{ type: "text", text: "hi there" }] },
    ];
    const out = convertToAiSdk(msgs);
    expect(out[0]).toEqual({ role: "assistant", content: "hi there" });
  });

  test("assistant tool_call+thinking maps to reasoning + tool-call parts", () => {
    const msgs: OpenSeekMessage[] = [
      {
        role: "assistant",
        content: [
          { type: "thinking", text: "I should look at the file" },
          { type: "tool_call", toolCallId: "c1", toolName: "read", args: { path: "a.md" } },
        ],
      },
    ];
    const out = convertToAiSdk(msgs);
    expect(out[0]?.role).toBe("assistant");
    // Should be an array of parts (not a string), with reasoning + tool-call.
    const content = out[0]?.content as Array<{ type: string }>;
    expect(Array.isArray(content)).toBe(true);
    expect(content[0]?.type).toBe("reasoning");
    expect(content[1]?.type).toBe("tool-call");
  });

  test("tool result message produces tool-result part with text output", () => {
    const msgs: OpenSeekMessage[] = [
      {
        role: "tool",
        toolCallId: "c1",
        content: [
          {
            type: "tool_result",
            toolCallId: "c1",
            result: "file contents",
          },
        ],
      },
    ];
    const out = convertToAiSdk(msgs);
    expect(out[0]?.role).toBe("tool");
    const content = out[0]?.content as Array<{
      type: string;
      toolCallId: string;
      output: { type: string; value: string };
    }>;
    expect(content[0]?.type).toBe("tool-result");
    expect(content[0]?.toolCallId).toBe("c1");
    expect(content[0]?.output).toEqual({ type: "text", value: "file contents" });
  });

  test("error tool result encodes as error-text", () => {
    const msgs: OpenSeekMessage[] = [
      {
        role: "tool",
        toolCallId: "c2",
        content: [
          { type: "tool_result", toolCallId: "c2", result: "boom", isError: true },
        ],
      },
    ];
    const out = convertToAiSdk(msgs);
    const content = out[0]?.content as Array<{ output: { type: string } }>;
    expect(content[0]?.output.type).toBe("error-text");
  });
});

describe("convertToolsToAiSdk", () => {
  function makeTool(name: string, permission: AnyTool["permission"] = "auto"): AnyTool {
    return {
      name,
      description: `${name} tool`,
      inputSchema: z.object({ x: z.string() }),
      permission,
      async call(input) {
        return { kind: "text", text: `${name}:${(input as { x: string }).x}` };
      },
    };
  }

  test("produces an entry per tool with description set", () => {
    const tools = new Map<string, AnyTool>([
      ["read", makeTool("read")],
      ["write", makeTool("write")],
    ]);
    const ctx = {
      abort: new AbortController().signal,
      cwd: "/tmp",
      mode: "agent" as const,
      log: { debug() {}, info() {}, warn() {}, error() {} },
    };
    const out = convertToolsToAiSdk(tools, { ctx });
    expect(Object.keys(out).sort()).toEqual(["read", "write"]);
    const entry = out.read as unknown as { description: string };
    expect(entry.description).toBe("read tool");
  });

  test("execute closure invokes underlying tool and reports via onResult", async () => {
    const tools = new Map<string, AnyTool>([["read", makeTool("read")]]);
    const ctx = {
      abort: new AbortController().signal,
      cwd: "/tmp",
      mode: "agent" as const,
      log: { debug() {}, info() {}, warn() {}, error() {} },
    };
    const observed: Array<{ id: string; name: string }> = [];
    const out = convertToolsToAiSdk(tools, {
      ctx,
      onResult: (entry) => observed.push({ id: entry.id, name: entry.name }),
    });
    const wrapped = out.read as unknown as {
      execute: (
        input: unknown,
        opts: { toolCallId: string; abortSignal?: AbortSignal; messages: unknown[] },
      ) => Promise<unknown>;
    };
    const result = await wrapped.execute(
      { x: "hello" },
      { toolCallId: "call-9", abortSignal: ctx.abort, messages: [] },
    );
    expect(result).toEqual({ ok: true, text: "read:hello" });
    expect(observed).toEqual([{ id: "call-9", name: "read" }]);
  });

  test("agent mode denies non-auto tools when approval returns false", async () => {
    let calls = 0;
    const tool: AnyTool = {
      ...makeTool("write", "deny-in-plan"),
      async call(input, ctx) {
        calls += 1;
        return await makeTool("write").call(input, ctx);
      },
    };
    const ctx = {
      abort: new AbortController().signal,
      cwd: "/tmp",
      mode: "agent" as const,
      log: { debug() {}, info() {}, warn() {}, error() {} },
    };
    const observed: Array<{ id: string; name: string; ok: boolean }> = [];
    const out = convertToolsToAiSdk(new Map([["write", tool]]), {
      ctx,
      approveToolCall: async () => false,
      onResult: (entry) =>
        observed.push({ id: entry.id, name: entry.name, ok: entry.result.kind !== "error" }),
    });
    const wrapped = out.write as unknown as {
      execute: (input: unknown, opts: { toolCallId: string; messages: unknown[] }) => Promise<unknown>;
    };

    const result = await wrapped.execute({ x: "hello" }, { toolCallId: "call-deny", messages: [] });

    expect(calls).toBe(0);
    expect(result).toEqual({ ok: false, error: "tool call denied by user: write" });
    expect(observed).toEqual([{ id: "call-deny", name: "write", ok: false }]);
  });

  test("yolo mode bypasses approval for non-auto tools", async () => {
    let approvals = 0;
    const ctx = {
      abort: new AbortController().signal,
      cwd: "/tmp",
      mode: "yolo" as const,
      log: { debug() {}, info() {}, warn() {}, error() {} },
    };
    const out = convertToolsToAiSdk(new Map([["write", makeTool("write", "deny-in-plan")]]), {
      ctx,
      approveToolCall: async () => {
        approvals += 1;
        return false;
      },
    });
    const wrapped = out.write as unknown as {
      execute: (input: unknown, opts: { toolCallId: string; messages: unknown[] }) => Promise<unknown>;
    };

    const result = await wrapped.execute({ x: "hello" }, { toolCallId: "call-yolo", messages: [] });

    expect(approvals).toBe(0);
    expect(result).toEqual({ ok: true, text: "write:hello" });
  });
});
