// Convert a session-layer `OpenSeekMessage` into 1+ `TranscriptMessage` rows.
//
// One assistant message can hold thinking + text + tool_call blocks. The TUI
// renders each as a separate row so colour/italic treatments don't bleed into
// each other (G1.4 thinking-mode block must be gray+italic standalone).

import type { OpenSeekMessage, ContentBlock } from "@openseek/provider";
import type { TranscriptMessage } from "./types.ts";

export interface FormatOptions {
  /** Stable id prefix; tests pass deterministic strings. */
  idPrefix?: string;
}

/**
 * Pure function — no side effects, deterministic given (msg, idPrefix, index).
 * `index` lets callers chain multiple messages without id collisions.
 */
export function toTranscriptMessages(
  msg: OpenSeekMessage,
  idPrefix = "m",
  index = 0,
): TranscriptMessage[] {
  const out: TranscriptMessage[] = [];
  const id = (suffix: string | number) => `${idPrefix}-${index}-${suffix}`;

  switch (msg.role) {
    case "user": {
      const text = collectText(msg.content);
      if (text.length > 0) out.push({ id: id("user"), kind: "user", text });
      break;
    }

    case "system": {
      const text = collectText(msg.content);
      if (text.length > 0) out.push({ id: id("system"), kind: "system", text });
      break;
    }

    case "assistant": {
      // Each block becomes its own row. Order preserved.
      msg.content.forEach((block, blockIdx) => {
        const blockId = id(`a${blockIdx}`);
        switch (block.type) {
          case "thinking":
            if (block.text.length > 0) {
              out.push({ id: blockId, kind: "assistant-thinking", text: block.text });
            }
            break;
          case "text":
            if (block.text.length > 0) {
              out.push({ id: blockId, kind: "assistant-text", text: block.text });
            }
            break;
          case "tool_call":
            out.push({
              id: blockId,
              kind: "tool-call",
              toolName: block.toolName,
              args: block.args,
              toolCallId: block.toolCallId,
            });
            break;
          case "tool_result":
            // Assistants normally don't emit tool_result, but be defensive.
            out.push({
              id: blockId,
              kind: "tool-result",
              toolCallId: block.toolCallId,
              result: block.result,
              isError: block.isError,
            });
            break;
        }
      });
      break;
    }

    case "tool": {
      msg.content.forEach((block, blockIdx) => {
        if (block.type === "tool_result") {
          out.push({
            id: id(`t${blockIdx}`),
            kind: "tool-result",
            toolCallId: block.toolCallId,
            result: block.result,
            isError: block.isError,
          });
        }
      });
      break;
    }
  }

  return out;
}

function collectText(blocks: ContentBlock[]): string {
  return blocks
    .filter((b): b is Extract<ContentBlock, { type: "text" }> => b.type === "text")
    .map((b) => b.text)
    .join("");
}

/** Crude pretty-print for tool_call arguments — used by MessageRow. */
export function summarizeArgs(args: unknown, maxLen = 80): string {
  if (args === undefined || args === null) return "";
  let s: string;
  try {
    s = typeof args === "string" ? args : JSON.stringify(args);
  } catch {
    s = String(args);
  }
  if (s.length <= maxLen) return s;
  return `${s.slice(0, maxLen - 1)}…`;
}

/** Truncate tool result to keep the transcript scannable. */
export function summarizeResult(result: unknown, maxLen = 200): string {
  let s: string;
  if (result === undefined || result === null) {
    s = "";
  } else if (typeof result === "string") {
    s = result;
  } else {
    try {
      s = JSON.stringify(result);
    } catch {
      s = String(result);
    }
  }
  if (s.length <= maxLen) return s;
  return `${s.slice(0, maxLen)}…`;
}
