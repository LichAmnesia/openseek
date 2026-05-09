// Main streaming run loop for OpenSeek (G1.3 + G1.6).
//
// `runSession` is an async generator: callers consume StreamEvent chunks
// via for-await. ai-SDK's `streamText` does the heavy lifting (tool-loop,
// chunk normalization, abort propagation); we translate its `TextStreamPart`
// union to our internal StreamEvent union and inject ToolContext into each
// tool execution via the closure built in `convertToolsToAiSdk`.
//
// Cancel rules (G1.6):
//   * If signal is already aborted: yield {type:"cancelled"} and return.
//   * On AbortError mid-stream: yield {type:"cancelled"} with the partial
//     assistant message as a reference; mark its content with `[cancelled]`
//     so transcripts render the half-message clearly.
//   * No fallback retries — surface errors via {type:"error"}.

import { streamText, stepCountIs, type LanguageModelUsage } from "ai";
import { formatDiagnostics, type LspDiagnostic } from "@openseek/lsp";
import { replayReasoning, type ContentBlock } from "@openseek/provider";
import type { ToolContext, ToolResult } from "@openseek/tool";
import { noopLogger } from "@openseek/tool";
import { microCompact } from "./compact/micro.ts";
import { buildProviderOptions, toUsageSnapshot } from "./effort.ts";
import { filterToolsByMode } from "./mode-gate.ts";
import { synthesizeTurnMessages } from "./synthesize-turn.ts";
import { convertToAiSdk, convertToolsToAiSdk, splitSystemPrefix } from "./transform.ts";
import { isAbort, snapshotPartial, translateChunk } from "./translate.ts";
import type { RunOptions, SessionState, StreamEvent } from "./types.ts";

const DEFAULT_MAX_STEPS = 12;

/**
 * T1: defensive strip of any Anthropic-style `cache_control` field that
 * may have been smuggled onto a content block (current ContentBlock typing
 * doesn't carry it, but ad-hoc casts in protocol shims could). Returns a
 * shallow copy of the message with cache_control removed from every block.
 *
 * Exported only so the unit test in tests/run-break-cache.test.ts can
 * exercise it directly — runtime callers should set state.breakCache and
 * let the runner invoke this for them.
 */
export function stripCacheControl(msg: import("@openseek/provider").OpenSeekMessage): import("@openseek/provider").OpenSeekMessage {
  const cleaned = msg.content.map((block) => {
    if (block && typeof block === "object" && "cache_control" in (block as Record<string, unknown>)) {
      const { cache_control: _drop, ...rest } = block as Record<string, unknown>;
      return rest as typeof block;
    }
    return block;
  });
  return { ...msg, content: cleaned };
}

// Tools whose successful execution should trigger an LSP probe on the
// touched file. Each tool's input shape is normalized via `extractEditPath`.
const EDIT_TOOLS = new Set(["edit", "write", "apply_patch", "notebook_edit"]);

function extractEditPath(name: string, input: unknown): string | null {
  if (!input || typeof input !== "object") return null;
  const obj = input as Record<string, unknown>;
  if (name === "edit" || name === "write" || name === "notebook_edit") {
    const p = obj.path;
    return typeof p === "string" && p.length > 0 ? p : null;
  }
  if (name === "apply_patch") {
    // The patch carries '+++ b/<path>' lines. Pick the first match — multi-file
    // patches will surface diagnostics on the first touched file; subsequent
    // files round-trip through the next turn.
    const patch = obj.patch;
    if (typeof patch !== "string") return null;
    const m = /^\+\+\+\s+(?:b\/)?(.+)$/m.exec(patch);
    return m?.[1] ? m[1].trim() : null;
  }
  return null;
}

export async function* runSession(
  state: SessionState,
  opts: RunOptions,
): AsyncGenerator<StreamEvent, void, void> {
  // Pre-flight: caller already aborted → no provider call, no message mutation.
  if (opts.signal.aborted) {
    yield { type: "cancelled" };
    return;
  }

  // 1. Apply DeepSeek reasoning replay to the wire history (no mutation of state).
  let wireMessages = replayReasoning(state.messages, opts.capability.requiresReasoningReplay);

  // T1: /break-cache — strip Anthropic cache_control breakpoints from
  // outbound content blocks so the next request misses the provider's
  // prompt cache. cache_control is currently a passthrough field on
  // text blocks (see provider/shim.ts AnthropicTextBlock); future
  // breakpoint-injection code MUST honor this strip path.
  if (state.breakCache) {
    wireMessages = wireMessages.map((m) => stripCacheControl(m));
  }

  // 2. Build the ToolContext closure that every tool execution will see.
  const ctx: ToolContext = {
    abort: opts.signal,
    cwd: opts.cwd ?? process.cwd(),
    mode: state.mode,
    log: noopLogger,
  };

  // Plan mode strips deny-in-plan tools so the model never sees write/edit
  // affordances; Agent / YOLO get the whole map. The result is a fresh Map,
  // so downstream registry mutations don't leak into the active turn.
  const gatedTools = filterToolsByMode(opts.tools, state.mode);

  // Index real ToolResult objects by tool-call id so the tool-result chunk
  // (which only carries JSON-encoded output) can be joined back to the
  // typed ToolResult our consumers expect.
  const resultIndex = new Map<string, ToolResult>();
  // Track files touched by edit-family tools whose result is non-error.
  // Probed at turn-end to inject an LSP system-message into the next round.
  const lspFiles = new Set<string>();
  const aiTools = convertToolsToAiSdk(gatedTools, {
    ctx,
    approveToolCall: opts.approveToolCall,
    onResult: (entry) => {
      resultIndex.set(entry.id, entry.result);
      if (
        opts.lspRouter &&
        EDIT_TOOLS.has(entry.name) &&
        entry.result.kind !== "error"
      ) {
        const file = extractEditPath(entry.name, entry.input);
        if (file) lspFiles.add(file);
      }
    },
  });

  // 3. Track the in-flight assistant message blocks so we can surface a
  //    partial reference on cancel.
  const assistantBlocks: ContentBlock[] = [];
  let usage: LanguageModelUsage | undefined;
  let cancelled = false;
  let errored = false;

  // 4. Kick off ai-SDK streamText. Provider's createClient gives us a
  //    LanguageModelV3 instance; ai-SDK handles the tool-loop internally
  //    when tools have `execute` and `stopWhen` allows further steps.
  let stream: AsyncIterable<unknown>;
  try {
    const effort = opts.reasoningEffort ?? state.reasoningEffort ?? "off";
    // Lift leading system messages into ai-SDK's `system` parameter to avoid
    // the prompt-injection warning AND keep system content out of the
    // tool-call cache key (model-side cache is keyed off `system` separately).
    const { system, rest } = splitSystemPrefix(wireMessages);
    const result = streamText({
      // biome-ignore lint/suspicious/noExplicitAny: ai-SDK LanguageModel is a structural union.
      model: opts.provider.createClient(opts.model, {
        apiKey: opts.apiKey ?? "",
        baseURL: opts.baseURL,
      } as any) as any,
      ...(system.length > 0 ? { system } : {}),
      messages: convertToAiSdk(rest),
      tools: aiTools,
      abortSignal: opts.signal,
      stopWhen: stepCountIs(opts.maxSteps ?? DEFAULT_MAX_STEPS),
      providerOptions: buildProviderOptions(effort),
    });
    stream = result.fullStream as AsyncIterable<unknown>;
  } catch (err) {
    if (isAbort(err)) {
      yield { type: "cancelled", partial: snapshotPartial(assistantBlocks) };
      return;
    }
    yield { type: "error", err };
    return;
  }

  try {
    for await (const raw of stream) {
      if (opts.signal.aborted) {
        cancelled = true;
        break;
      }
      // biome-ignore lint/suspicious/noExplicitAny: TextStreamPart is a wide union; we tag-narrow below.
      const chunk = raw as any;
      const events = translateChunk(chunk, assistantBlocks, resultIndex);
      for (const ev of events) {
        if (ev.type === "finish") usage = ev.usage;
        yield ev;
      }
      if (chunk?.type === "abort") {
        cancelled = true;
        break;
      }
      if (chunk?.type === "error") {
        errored = true;
        yield { type: "error", err: chunk.error };
        break;
      }
      if (chunk?.type === "tool-error") {
        // Surface a tool-result event marked as error so consumers don't
        // miss the failure even though ai-SDK split it into a separate chunk.
        const id: string = chunk.toolCallId;
        const real = resultIndex.get(id);
        const result: ToolResult = real ?? {
          kind: "error",
          message: typeof chunk.error === "string" ? chunk.error : String(chunk.error),
        };
        assistantBlocks.push({
          type: "tool_result",
          toolCallId: id,
          result,
          isError: true,
        });
        yield {
          type: "tool-result",
          result: { id, name: chunk.toolName, result },
        };
      }
    }
  } catch (err) {
    if (isAbort(err) || opts.signal.aborted) {
      cancelled = true;
    } else {
      yield { type: "error", err };
      return;
    }
  }

  // F2: synthesize per-turn wire history (assistant + role="tool" pairs)
  // with reasoningContent set when the provider emitted thinking. The cli
  // wrapper folds these into wireMessages so the next turn carries context
  // (Bug 2.1) and the replayReasoning transform sees the field on
  // requiresReasoningReplay providers (Bug 2.2). Dangling tool_calls (no
  // matching result) are stripped on cancel paths so the next request
  // doesn't 400 on an orphan tool_call.
  const turnMessages = synthesizeTurnMessages(assistantBlocks);

  if (cancelled) {
    // F5 P0-NEW #1: assistant-turn is the SINGLE history source on cancel
    // too. `cancelled` no longer carries turnMessages (was double-appending).
    const partial = snapshotPartial(assistantBlocks);
    if (turnMessages.length > 0) yield { type: "assistant-turn", messages: turnMessages };
    yield { type: "cancelled", partial };
    return;
  }

  if (errored) return;

  if (turnMessages.length > 0) yield { type: "assistant-turn", messages: turnMessages };

  // Surface a normalized usage snapshot before turn-end so the TUI status
  // bar can update cumulative cache / in / out totals (G2.8). The snapshot
  // is omitted when the provider didn't report any usage at all.
  if (usage) {
    const snapshot = toUsageSnapshot(usage);
    if (snapshot) yield { type: "usage-update", snapshot };
  }

  // Auto-compact hook (SPEC G2.1): synchronously trim stale tool_result
  // blocks before turn-end. microCompact is a pure sync function and never
  // touches the LLM, so it cannot stall the generator. We mutate state.messages
  // in place because the caller already owns this reference and expects
  // post-turn message updates.
  if (opts.autoCompact) {
    const compacted = microCompact(
      { messages: state.messages },
      { keepRecentToolResults: opts.autoCompactKeep ?? 5 },
    );
    state.messages = compacted.messages;
  }

  // LSP feedback hook (G3.4): for each edit-touched file, run the router's
  // probe and append a `system` message with the formatted diagnostics so
  // the next assistant turn sees them as a system note. Best-effort —
  // probe failures are swallowed and never block turn-end.
  if (opts.lspRouter && lspFiles.size > 0) {
    const allDiags: LspDiagnostic[] = [];
    for (const file of lspFiles) {
      try {
        const diags = await opts.lspRouter.probe(file);
        for (const d of diags) allDiags.push(d);
      } catch {
        // best-effort; ignore
      }
    }
    if (allDiags.length > 0) {
      const note = formatDiagnostics(allDiags);
      if (note.length > 0) {
        state.messages.push({
          role: "system",
          content: [{ type: "text", text: note }],
        });
      }
    }
  }

  // Successful turn: emit terminator. Usage may be undefined when the
  // upstream provider doesn't report it (e.g. mock streams).
  yield { type: "turn-end", usage };
}
