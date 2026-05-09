// Glue layer: wires session events into reactive TUI signals.
// Lives outside index.ts so we can unit-test routing without mounting opentui.

import type { StreamEvent, UsageSnapshot } from "@openseek/session";
import type { OpenSeekMessage } from "@openseek/provider";
import type { TranscriptMessage } from "@openseek/tui";

export interface RoutingHandle {
  /**
   * Apply a single StreamEvent to the transcript and status.
   *
   * Optional `epoch` — when supplied, the event is dropped if it doesn't
   * match the routing's current epoch (set via `setEpoch`). This lets the
   * cli host invalidate in-flight streams on `/clear` / `/model` /
   * `/provider` without racing the still-iterating async generator.
   */
  apply(evt: StreamEvent, epoch?: number): void;
  /**
   * Bump the active epoch. Subsequent `apply` calls with an older epoch
   * are no-ops. Returns the new epoch for callers that need it.
   */
  bumpEpoch(): number;
  /** Read the current epoch (for capturing at submit-time). */
  epoch(): number;
  /** Tear down — flips a disposed flag so future apply() calls are no-ops. */
  dispose(): void;
}

export interface RoutingHooks {
  appendRow(row: TranscriptMessage): void;
  updateLastAssistantText(append: string): void;
  updateLastAssistantThinking(append: string): void;
  setStatus(s: "idle" | "streaming" | "cancelled" | "error"): void;
  /** Optional cumulative usage hook for status-bar (G2.8). */
  setUsage?(snap: UsageSnapshot): void;
  /**
   * Optional history hook for multi-turn context (Bug 2.1 fix). Fired with
   * the synthesized assistant + tool messages for the just-completed (or
   * just-cancelled) turn. The cli host pushes these into wireMessages so
   * the next user submit sends a complete history.
   */
  appendHistory?(messages: OpenSeekMessage[]): void;
}

let rowSeq = 0;
const nextId = () => `r${++rowSeq}`;

export function createRouting(hooks: RoutingHooks): RoutingHandle {
  let currentEpoch = 0;
  let disposed = false;
  return {
    apply(evt, epoch) {
      if (disposed) return;
      // Epoch guard (Bug 3.2 / 3.3 fix): events from an iterator that was
      // started before the user typed `/clear` or switched models carry an
      // older epoch. Drop them so they can't append to a fresh transcript.
      if (epoch !== undefined && epoch !== currentEpoch) return;
      switch (evt.type) {
        case "text-delta":
          hooks.updateLastAssistantText(evt.delta);
          return;
        case "thinking-delta":
          hooks.updateLastAssistantThinking(evt.delta);
          return;
        case "tool-call":
          hooks.appendRow({
            id: nextId(),
            kind: "tool-call",
            toolName: evt.call.name,
            args: evt.call.input,
            toolCallId: evt.call.id,
          });
          return;
        case "tool-result":
          hooks.appendRow({
            id: nextId(),
            kind: "tool-result",
            toolName: evt.result.name,
            result: evt.result.result,
            isError: evt.result.result.kind === "error",
            toolCallId: evt.result.id,
          });
          return;
        case "cancelled":
          // P0-NEW #1 (F5): history is appended via the `assistant-turn`
          // event (which fires on BOTH normal and cancel paths). Pre-fix,
          // the cancel path also carried `turnMessages` here and we routed
          // them through appendHistory, double-appending the assistant turn.
          // The `cancelled` event is UI-only now: render the cancelled row,
          // flip the status — no history side-effect.
          hooks.appendRow({ id: nextId(), kind: "cancelled" });
          hooks.setStatus("cancelled");
          return;
        case "assistant-turn":
          hooks.appendHistory?.(evt.messages);
          return;
        case "error":
          hooks.appendRow({
            id: nextId(),
            kind: "error",
            text: evt.err instanceof Error ? evt.err.message : String(evt.err),
          });
          hooks.setStatus("error");
          return;
        case "usage-update":
          hooks.setUsage?.(evt.snapshot);
          return;
        case "turn-end":
          hooks.setStatus("idle");
          return;
      }
    },
    bumpEpoch() {
      return ++currentEpoch;
    },
    epoch() {
      return currentEpoch;
    },
    dispose() {
      disposed = true;
    },
  };
}

export function userRow(text: string): TranscriptMessage {
  return { id: nextId(), kind: "user", text };
}

export function freshAssistantTextRow(): TranscriptMessage {
  return { id: nextId(), kind: "assistant-text", text: "" };
}

export function freshAssistantThinkingRow(): TranscriptMessage {
  return { id: nextId(), kind: "assistant-thinking", text: "" };
}

export function userMessage(text: string): OpenSeekMessage {
  return { role: "user", content: [{ type: "text", text }] };
}
