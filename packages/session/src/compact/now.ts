// compactNow — manual compaction entry point invoked by the `/compact`
// slash command (post-v1.0 D-class wiring).
//
// The other strategies in this folder are normally driven from inside the
// run loop (autoCompact at >80% context, microCompact every turn-end,
// reactiveCompact on history pressure). `/compact` is a USER-triggered
// pass: the CLI hands us the current wire-message buffer, picks a
// strategy, runs it once, and replaces the buffer with the result.
//
// We default to "session-memory" because that's the strategy the
// `/compact` handler in packages/command advertises. It needs an
// `onWrite` hook to persist the digest — the CLI passes one when it has
// SessionMemory wired; otherwise we substitute a no-op so the call still
// completes with a collapsed buffer (digest is then dropped on the
// floor — acceptable for v1.0 since session-memory persistence is a
// later milestone).

import type { OpenSeekMessage } from "@openseek/provider";
import { sessionMemoryCompact } from "./session-memory.ts";
import { microCompact } from "./micro.ts";
import { autoCompact } from "./auto.ts";
import type { CompactStrategy } from "./types.ts";

export interface CompactNowOptions {
  /** Strategy to apply. Default "session-memory". */
  strategy?: Extract<CompactStrategy, "session-memory" | "micro" | "auto">;
  /** Persist the digest somewhere durable; required for "auto" + optional for "session-memory". */
  onWrite?: (digest: string) => Promise<void>;
  /** Async summarizer used only by the "auto" strategy. */
  summarizer?: (messages: OpenSeekMessage[]) => Promise<string>;
  /** Tool-result keep count for the "micro" strategy (default 5). */
  keepRecentToolResults?: number;
}

export interface CompactNowResult {
  messages: OpenSeekMessage[];
  /** Drop in message count vs input (input.length - output.length). */
  removedCount: number;
  /** Strategy actually used. */
  strategy: CompactStrategy;
}

/**
 * Run a one-shot compaction over `messages`. Pure function: returns the
 * new buffer; the caller is responsible for replacing wire-history with
 * `result.messages`.
 *
 * Defaults to `session-memory` to match the `/compact` command handler's
 * advertised strategy. Falls back to a no-op writer when none is supplied
 * so callers without a SessionMemory backend still see a collapsed buffer.
 */
export async function compactNow(
  messages: OpenSeekMessage[],
  opts: CompactNowOptions = {},
): Promise<CompactNowResult> {
  const strategy = opts.strategy ?? "session-memory";
  const inputLen = messages.length;

  if (strategy === "micro") {
    const out = microCompact(
      { messages },
      { keepRecentToolResults: opts.keepRecentToolResults },
    );
    return {
      messages: out.messages,
      removedCount: 0, // micro strategy never drops messages, only mutates blocks
      strategy: "micro",
    };
  }

  if (strategy === "auto") {
    const summarizer =
      opts.summarizer ?? (async () => "(no summarizer wired; session continues with system + last user)");
    const out = await autoCompact({ messages }, { summarizer });
    return {
      messages: out.messages,
      removedCount: Math.max(0, inputLen - out.messages.length),
      strategy: "auto",
    };
  }

  // session-memory (default).
  const onWrite = opts.onWrite ?? (async () => {});
  const out = await sessionMemoryCompact({ messages }, { onWrite });
  return {
    messages: out.messages,
    removedCount: Math.max(0, inputLen - out.messages.length),
    strategy: "session-memory",
  };
}
