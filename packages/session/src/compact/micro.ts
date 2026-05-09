// microCompact — strip old tool_result content blocks (SPEC G2.1 #1).
//
// Cheapest strategy: NO LLM call, NO message removal — only the *content*
// inside `tool_result` blocks is replaced with a sentinel marker. Keeps the
// `keepRecentToolResults` most-recent tool results untouched so the model
// still sees relevant context near the tail of the conversation.
//
// This is the strategy that runs every turn-end when `RunOptions.autoCompact`
// is true (light enough to be a no-op on conversations with few results).

import type { ContentBlock, OpenSeekMessage } from "@openseek/provider";
import {
  CLEARED_TOOL_RESULT_MARKER,
  type CompactInput,
  type CompactOutput,
} from "./types.ts";

export interface MicroCompactOptions {
  /** Default 5: how many most-recent tool_result blocks to keep verbatim. */
  keepRecentToolResults?: number;
}

export function microCompact(input: CompactInput, opts: MicroCompactOptions = {}): CompactOutput {
  const keep = opts.keepRecentToolResults ?? 5;
  const { messages } = input;

  // Index every (msg, block) location whose block is a tool_result, then
  // mark all but the last `keep` of them as "to clear". Single linear pass
  // back-to-front, then a second pass to materialize a new structure only
  // where a clear is needed (untouched messages keep their original ref).
  const indices: Array<{ msg: number; block: number }> = [];
  for (let m = 0; m < messages.length; m++) {
    const blocks = messages[m]?.content;
    if (!blocks) continue;
    for (let b = 0; b < blocks.length; b++) {
      if (blocks[b]?.type === "tool_result") indices.push({ msg: m, block: b });
    }
  }

  if (indices.length <= keep) {
    return { messages: [...messages], dropped: 0, strategy: "micro" };
  }

  const toClear = new Set<string>();
  for (let i = 0; i < indices.length - keep; i++) {
    const { msg, block } = indices[i]!;
    toClear.add(`${msg}:${block}`);
  }

  const out: OpenSeekMessage[] = messages.map((msg, m) => {
    let mutated = false;
    const newBlocks: ContentBlock[] = msg.content.map((blk, b) => {
      if (blk.type === "tool_result" && toClear.has(`${m}:${b}`)) {
        mutated = true;
        return {
          type: "tool_result",
          toolCallId: blk.toolCallId,
          result: CLEARED_TOOL_RESULT_MARKER,
          isError: blk.isError,
        };
      }
      return blk;
    });
    return mutated ? { ...msg, content: newBlocks } : msg;
  });

  return { messages: out, dropped: 0, strategy: "micro" };
}
