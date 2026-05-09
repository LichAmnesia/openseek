// sessionMemoryCompact — write conversation digest to SessionMemory then
// hard-clear the working context (SPEC G2.1 #4).
//
// Used by `/compact` and the auto-followup path: after digesting the
// conversation through the user-supplied `onWrite` hook (real impl will
// persist to `.openseek/memory.md`; tests use an in-memory stub), the
// in-flight context is collapsed to system messages plus the very last
// user turn. This is the most aggressive compaction strategy available.

import type { OpenSeekMessage } from "@openseek/provider";
import type { CompactInput, CompactOutput } from "./types.ts";

export interface SessionMemoryCompactOptions {
  /** Persist the digest somewhere durable; tests pass an in-memory stub. */
  onWrite: (digest: string) => Promise<void>;
}

export async function sessionMemoryCompact(
  input: CompactInput,
  opts: SessionMemoryCompactOptions,
): Promise<CompactOutput> {
  const { messages } = input;
  const digest = buildDigest(messages);
  await opts.onWrite(digest);

  // Keep all leading system messages (they encode the agent prompt) and the
  // single most recent user message — drop everything in between.
  const head: OpenSeekMessage[] = [];
  for (const msg of messages) {
    if (msg.role === "system") head.push(msg);
    else break;
  }

  let lastUser: OpenSeekMessage | null = null;
  for (let i = messages.length - 1; i >= 0; i--) {
    if (messages[i]?.role === "user") {
      lastUser = messages[i]!;
      break;
    }
  }

  const out = lastUser ? [...head, lastUser] : head;
  return {
    messages: out,
    dropped: messages.length - out.length,
    strategy: "session-memory",
  };
}

function buildDigest(messages: OpenSeekMessage[]): string {
  const lines: string[] = ["# Session digest"];
  for (const msg of messages) {
    const text = msg.content
      .map((b) => {
        if (b.type === "text") return b.text;
        if (b.type === "thinking") return `(thinking) ${b.text}`;
        if (b.type === "tool_call") return `(tool ${b.toolName})`;
        if (b.type === "tool_result") return `(tool_result)`;
        return "";
      })
      .filter(Boolean)
      .join(" ");
    if (text) lines.push(`- ${msg.role}: ${truncate(text, 120)}`);
  }
  return lines.join("\n");
}

function truncate(s: string, n: number): string {
  return s.length <= n ? s : `${s.slice(0, n)}…`;
}
