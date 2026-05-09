// Synthesize the per-turn `assistantBlocks` accumulator into ordered
// wire-history messages. ai-SDK can emit a multi-step turn
// (assistant→tool→assistant→...); each sub-step's assistant ContentBlocks
// must become its own assistant message, with the tool_result block(s)
// immediately following it converted into role="tool" messages so the
// upstream API sees the canonical
//   [assistant w/ tool_call] → [tool result] → [assistant w/ tool_call] → ...
// sequence.
//
// This is the load-bearing path for F2 Bug 2.1 (multi-turn) AND Bug 2.2
// (reasoning replay) — assistant messages get `reasoningContent` populated
// from accumulated thinking blocks so providers with
// `requiresReasoningReplay: true` can replay it on the next request.
//
// Edge cases:
//  - on cancel mid-stream, dangling tool_call blocks (no matching
//    tool_result) are stripped so the wire history doesn't carry an orphan
//    tool_call that the next turn's API would 400 on. The model's
//    text/thinking content from that aborted sub-step is preserved.
//  - empty assistant sub-steps (no useful content after stripping) are
//    dropped to avoid polluting the wire history.

import type { ContentBlock, OpenSeekMessage } from "@openseek/provider";

export interface SynthesizeOpts {
  /**
   * When true, dangling tool_calls (no matching tool_result yet) are kept in
   * the assistant message. Default false: cancel-path + half-step cleanup.
   */
  includeDanglingToolCalls?: boolean;
}

export function synthesizeTurnMessages(
  blocks: ContentBlock[],
  opts: SynthesizeOpts = {},
): OpenSeekMessage[] {
  const out: OpenSeekMessage[] = [];
  let pending: ContentBlock[] = [];
  const flushAssistant = (): void => {
    if (pending.length === 0) return;
    const reasoning = pending
      .filter((b): b is { type: "thinking"; text: string } => b.type === "thinking")
      .map((b) => b.text)
      .join("");
    const cleaned = opts.includeDanglingToolCalls
      ? pending
      : pending.filter((b) => b.type !== "tool_call" || hasMatchingResult(b.toolCallId, blocks));
    if (cleaned.length === 0) {
      pending = [];
      return;
    }
    const msg: OpenSeekMessage = { role: "assistant", content: cleaned };
    if (reasoning.length > 0) msg.reasoningContent = reasoning;
    out.push(msg);
    pending = [];
  };

  for (const block of blocks) {
    if (block.type === "tool_result") {
      flushAssistant();
      out.push({
        role: "tool",
        toolCallId: block.toolCallId,
        content: [block],
      });
      continue;
    }
    pending.push(block);
  }
  flushAssistant();
  return out;
}

function hasMatchingResult(toolCallId: string, blocks: ContentBlock[]): boolean {
  for (const b of blocks) {
    if (b.type === "tool_result" && b.toolCallId === toolCallId) return true;
  }
  return false;
}
