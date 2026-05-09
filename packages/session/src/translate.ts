// Stream-chunk translator (extracted from run.ts to keep file LOC under
// budget for G2.5/2.6/2.8). Pure: takes an ai-SDK TextStreamPart, mutates
// the running `blocks` array, and emits zero-or-more StreamEvent values.

import type { ContentBlock, OpenSeekMessage } from "@openseek/provider";
import type { ToolResult } from "@openseek/tool";
import type { StreamEvent } from "./types.ts";

const CANCELLED_MARK = "[cancelled]";

export function translateChunk(
  // biome-ignore lint/suspicious/noExplicitAny: TextStreamPart is structurally narrow per chunk.type.
  chunk: any,
  blocks: ContentBlock[],
  resultIndex: Map<string, ToolResult>,
): StreamEvent[] {
  const t = chunk?.type;
  if (t === "text-delta") {
    const delta: string = chunk.text ?? chunk.delta ?? "";
    if (delta.length === 0) return [];
    appendText(blocks, delta);
    return [{ type: "text-delta", delta }];
  }
  if (t === "reasoning-delta" || t === "reasoning") {
    const delta: string = chunk.text ?? chunk.delta ?? "";
    if (delta.length === 0) return [];
    appendThinking(blocks, delta);
    return [{ type: "thinking-delta", delta }];
  }
  if (t === "tool-call") {
    blocks.push({
      type: "tool_call",
      toolCallId: chunk.toolCallId,
      toolName: chunk.toolName,
      args: chunk.input,
    });
    return [
      {
        type: "tool-call",
        call: { id: chunk.toolCallId, name: chunk.toolName, input: chunk.input },
      },
    ];
  }
  if (t === "tool-result") {
    const id: string = chunk.toolCallId;
    const real = resultIndex.get(id);
    const result: ToolResult = real ?? wrapJsonableOutput(chunk.output);
    blocks.push({
      type: "tool_result",
      toolCallId: id,
      result,
      isError: result.kind === "error",
    });
    return [
      { type: "tool-result", result: { id, name: chunk.toolName, result } },
    ];
  }
  if (t === "finish") {
    return [{ type: "finish", usage: chunk.totalUsage }];
  }
  return [];
}

function wrapJsonableOutput(output: unknown): ToolResult {
  if (typeof output === "string") return { kind: "text", text: output };
  return { kind: "text", text: JSON.stringify(output) };
}

function appendText(blocks: ContentBlock[], delta: string): void {
  const last = blocks[blocks.length - 1];
  if (last && last.type === "text") last.text += delta;
  else blocks.push({ type: "text", text: delta });
}

function appendThinking(blocks: ContentBlock[], delta: string): void {
  const last = blocks[blocks.length - 1];
  if (last && last.type === "thinking") last.text += delta;
  else blocks.push({ type: "thinking", text: delta });
}

export function snapshotPartial(blocks: ContentBlock[]): OpenSeekMessage {
  const cloned: ContentBlock[] = blocks.map((b) => ({ ...b }) as ContentBlock);
  const last = cloned[cloned.length - 1];
  if (last && (last.type === "text" || last.type === "thinking")) {
    last.text = `${last.text} ${CANCELLED_MARK}`.trim();
  } else {
    cloned.push({ type: "text", text: CANCELLED_MARK });
  }
  return { role: "assistant", content: cloned };
}

export function isAbort(err: unknown): boolean {
  if (!err || typeof err !== "object") return false;
  const e = err as { name?: unknown; message?: unknown };
  if (e.name === "AbortError") return true;
  if (typeof e.message === "string" && /abort/i.test(e.message)) return true;
  return false;
}
