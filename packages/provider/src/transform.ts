// Pre-flight transforms applied to message history before sending to a
// provider. The flagship transform is `replayReasoning`, which restores
// DeepSeek V4's `reasoning_content` onto assistant tool_call messages so
// follow-up requests do not 400.

import type { ContentBlock, OpenSeekMessage } from "./types.ts";

/**
 * Inline `reasoningContent` back into an assistant tool_call message's
 * `content` array as a leading `thinking` block, so the wire-level message
 * carries the reasoning the API needs to replay.
 *
 * Only assistant messages whose content contains at least one `tool_call`
 * block are touched. Other messages pass through unchanged.
 *
 * NEVER mutates the input array or any of its messages — always returns a
 * new array with new message objects for the rewritten entries.
 */
export function replayReasoning(
  messages: OpenSeekMessage[],
  requiresReplay: boolean,
): OpenSeekMessage[] {
  if (!requiresReplay) {
    // Defensive copy so callers can rely on a fresh array reference.
    return messages.slice();
  }

  return messages.map((msg) => {
    if (msg.role !== "assistant") return msg;
    if (!msg.reasoningContent) return msg;
    if (!hasToolCall(msg.content)) return msg;
    if (hasLeadingThinking(msg.content)) return msg;

    const thinking: ContentBlock = { type: "thinking", text: msg.reasoningContent };
    return {
      ...msg,
      content: [thinking, ...msg.content],
    };
  });
}

function hasToolCall(content: ContentBlock[]): boolean {
  for (const block of content) {
    if (block.type === "tool_call") return true;
  }
  return false;
}

function hasLeadingThinking(content: ContentBlock[]): boolean {
  const head = content[0];
  return head !== undefined && head.type === "thinking";
}

/**
 * Pull the reasoning text from an ai-SDK stream chunk. The field has gone by
 * several names across SDK versions and provider implementations; we accept
 * any of them so upstream code can be SDK-version agnostic.
 */
export function extractReasoning(
  chunk: {
    reasoning?: unknown;
    reasoningContent?: unknown;
    reasoning_content?: unknown;
  } | null
    | undefined,
): string | undefined {
  if (!chunk) return undefined;
  const candidates = [chunk.reasoning, chunk.reasoningContent, chunk.reasoning_content];
  for (const value of candidates) {
    if (typeof value === "string" && value.length > 0) return value;
  }
  return undefined;
}
