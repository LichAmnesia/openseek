// Bidirectional shape converters between OpenSeek's internal message format
// and ai-SDK's `ModelMessage` + `Tool` shapes.
//
// We never round-trip ai-SDK chunks back to OpenSeekMessage here — the run
// loop does that explicitly so it can interleave tool execution.

import { tool, type ModelMessage, type Tool as AiTool } from "ai";
import type { ContentBlock, OpenSeekMessage } from "@openseek/provider";
import type { AnyTool, ToolContext, ToolResult } from "@openseek/tool";
import type { ToolApprovalRequest } from "./types.ts";

/** Convert OpenSeek's role-tagged messages to ai-SDK's ModelMessage[]. */
export function convertToAiSdk(messages: OpenSeekMessage[]): ModelMessage[] {
  const out: ModelMessage[] = [];
  for (const msg of messages) {
    const converted = convertOne(msg);
    if (converted) out.push(converted);
  }
  return out;
}

/**
 * Split messages into a leading `system` string + non-system tail.
 *
 * ai-SDK 6.x prefers system prompts in the dedicated `system` parameter
 * (avoids prompt-injection surface from inline-message system roles).
 * Multiple leading system messages are concatenated with `\n\n`. Trailing
 * system messages mid-conversation pass through as-is in `messages`.
 */
export function splitSystemPrefix(messages: OpenSeekMessage[]): {
  system: string;
  rest: OpenSeekMessage[];
} {
  const systemTexts: string[] = [];
  let i = 0;
  while (i < messages.length && messages[i]?.role === "system") {
    const m = messages[i];
    if (m) systemTexts.push(collapseToText(m.content));
    i += 1;
  }
  return {
    system: systemTexts.filter((s) => s.length > 0).join("\n\n"),
    rest: messages.slice(i),
  };
}

function convertOne(msg: OpenSeekMessage): ModelMessage | null {
  switch (msg.role) {
    case "system":
      return { role: "system", content: collapseToText(msg.content) };
    case "user":
      return { role: "user", content: collapseToText(msg.content) };
    case "assistant":
      return { role: "assistant", content: assistantParts(msg.content) };
    case "tool":
      return { role: "tool", content: toolParts(msg.content, msg.toolCallId) };
    default:
      return null;
  }
}

function collapseToText(blocks: ContentBlock[]): string {
  // Multimodal blocks degrade to text — atomos vault is text-only and the
  // session layer is provider-protocol-agnostic; richer parts can be added
  // when v0.5 onboards image-capable providers.
  return blocks
    .map((b) => (b.type === "text" || b.type === "thinking" ? b.text : ""))
    .filter((t) => t.length > 0)
    .join("\n");
}

// biome-ignore lint/suspicious/noExplicitAny: AssistantContent[] union is wide; we narrow per-block manually.
function assistantParts(blocks: ContentBlock[]): any {
  const parts: Array<Record<string, unknown>> = [];
  for (const b of blocks) {
    if (b.type === "text") parts.push({ type: "text", text: b.text });
    else if (b.type === "thinking") parts.push({ type: "reasoning", text: b.text });
    else if (b.type === "tool_call") {
      parts.push({
        type: "tool-call",
        toolCallId: b.toolCallId,
        toolName: b.toolName,
        input: b.args,
      });
    }
  }
  // ai-SDK accepts `string` shorthand when the message is plain text.
  if (parts.length === 1 && parts[0]?.type === "text") return parts[0].text as string;
  return parts;
}

// biome-ignore lint/suspicious/noExplicitAny: ToolContent shape uses tagged-union ToolResultOutput we synthesize.
function toolParts(blocks: ContentBlock[], toolCallId?: string): any {
  return blocks
    .filter((b) => b.type === "tool_result")
    .map((b) => {
      if (b.type !== "tool_result") return null;
      return {
        type: "tool-result" as const,
        toolCallId: b.toolCallId ?? toolCallId ?? "",
        toolName: "",
        output: encodeToolOutput(b.result, b.isError),
      };
    })
    .filter((x): x is NonNullable<typeof x> => x !== null);
}

function encodeToolOutput(
  result: unknown,
  isError?: boolean,
): { type: "text"; value: string } | { type: "error-text"; value: string } {
  const text = typeof result === "string" ? result : JSON.stringify(result);
  return isError ? { type: "error-text", value: text } : { type: "text", value: text };
}

export interface ConvertToolsOptions {
  /** Closure-captured ctx flows into every tool call. */
  ctx: ToolContext;
  /** Optional Agent-mode approval hook for non-auto tools. */
  approveToolCall?: (req: ToolApprovalRequest) => Promise<boolean>;
  /** Fired right after a tool resolves so the run loop can yield a stream event. */
  onResult?: (entry: {
    id: string;
    name: string;
    input: unknown;
    result: import("@openseek/tool").ToolResult;
  }) => void;
}

/**
 * Wrap our ToolRegistry tools in ai-SDK's `tool()` helper. The `execute`
 * closure captures ToolContext so abort/mode/cwd/log are honored, and pipes
 * the resolved result through `onResult` so the run loop can surface a
 * `tool-result` StreamEvent.
 *
 * The wrapper returns a JSON-serializable shape (string or object) — ai-SDK
 * needs that to round-trip the result into the next request.
 */
export function convertToolsToAiSdk(
  tools: Map<string, AnyTool>,
  opts: ConvertToolsOptions,
  // biome-ignore lint/suspicious/noExplicitAny: ai-SDK Tool generics are deeply structural.
): Record<string, AiTool<any, any>> {
  const out: Record<string, AiTool> = {};
  for (const [name, t] of tools.entries()) {
    out[name] = tool({
      description: t.description,
      // FlexibleSchema accepts ZodSchema directly per provider-utils types.
      // biome-ignore lint/suspicious/noExplicitAny: zod v4 schemas are structurally accepted.
      inputSchema: t.inputSchema as any,
      execute: async (input, options) => {
        // Prefer ai-SDK's per-call abort signal if it's wired (it forwards the
        // outer streamText.abortSignal); fall back to ctx.abort.
        const abort = options?.abortSignal ?? opts.ctx.abort;
        const localCtx: ToolContext = { ...opts.ctx, abort };
        const id = options?.toolCallId ?? "";
        if (shouldAskForApproval(t, localCtx.mode) && opts.approveToolCall) {
          const approved = await opts.approveToolCall({
            id,
            name,
            input,
            permission: t.permission,
          });
          if (approved !== true) {
            const denied: ToolResult = {
              kind: "error",
              message: `tool call denied by user: ${name}`,
            };
            opts.onResult?.({ id, name, input, result: denied });
            return toJsonable(denied);
          }
        }
        // biome-ignore lint/suspicious/noExplicitAny: ai-SDK passes validated input as unknown.
        const result = await t.call(input as any, localCtx);
        opts.onResult?.({ id, name, input, result });
        // Normalize so ai-SDK can stringify deterministically when looping.
        return toJsonable(result);
      },
    });
  }
  return out;
}

function shouldAskForApproval(toolDef: AnyTool, mode: ToolContext["mode"]): boolean {
  if (mode !== "agent") return false;
  return toolDef.permission !== "auto";
}

function toJsonable(result: ToolResult): unknown {
  if (result.kind === "text") return { ok: true, text: result.text };
  if (result.kind === "diff") {
    return { ok: true, kind: "diff", path: result.path };
  }
  return { ok: false, error: result.message };
}
