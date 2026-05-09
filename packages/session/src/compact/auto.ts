// autoCompact — full-context compression triggered when usage > 80% capacity
// (SPEC G2.1 #2).
//
// Calls a user-supplied summarizer to fold all "old" messages (everything
// except system + the most recent user turn) into a single synthetic
// assistant message. Tests inject a mock summarizer; production wires the
// active provider's chat completion endpoint.
//
// Contract:
//   * `summarizer` returns a single string that becomes the body of a
//     synthetic assistant message inserted directly after system messages.
//   * The most recent user message is preserved verbatim — the model needs
//     it to continue the current turn.
//   * If there is nothing to compact (≤2 messages, or only system+user),
//     the input is returned unchanged.

import type { OpenSeekMessage } from "@openseek/provider";
import type { CompactInput, CompactOutput } from "./types.ts";

export interface AutoCompactOptions {
  /** Summarizer fn — receives the messages slated for summarization, returns digest text. */
  summarizer: (messages: OpenSeekMessage[]) => Promise<string>;
}

export async function autoCompact(
  input: CompactInput,
  opts: AutoCompactOptions,
): Promise<CompactOutput> {
  const { messages } = input;
  if (messages.length <= 2) {
    return { messages: [...messages], dropped: 0, strategy: "auto" };
  }

  // Partition: leading system block (0..S-1), middle (S..len-2), trailing
  // last user message (len-1). If there is no middle to summarize, no-op.
  let systemEnd = 0;
  while (systemEnd < messages.length && messages[systemEnd]?.role === "system") {
    systemEnd += 1;
  }

  const lastIdx = messages.length - 1;
  // Only summarize if there is at least one message between system block
  // and the final preserved message.
  if (lastIdx - systemEnd < 1) {
    return { messages: [...messages], dropped: 0, strategy: "auto" };
  }

  const head = messages.slice(0, systemEnd);
  const middle = messages.slice(systemEnd, lastIdx);
  const tail = messages.slice(lastIdx);

  const digest = await opts.summarizer(middle);
  const summaryMsg: OpenSeekMessage = {
    role: "assistant",
    content: [{ type: "text", text: `[auto-compact summary]\n${digest}` }],
  };

  return {
    messages: [...head, summaryMsg, ...tail],
    dropped: middle.length - 1,
    strategy: "auto",
  };
}
