// In-process sub-agent fork (G3.3).
//
// `spawnAgent` drives an independent `runSession` async generator with its
// own AbortController, message buffer, and timeout. The parent does NOT
// block the caller — `result` resolves asynchronously when the child runs
// to `turn-end`, hits its timeout, or is aborted (parent or self).
//
// We deliberately stay in-process: a real `Bun.spawn` fork would re-init
// the provider/tool registry from disk and force IPC framing. v0.3 keeps
// the simpler model so abort semantics, mock providers, and observation
// stay direct.

import type { OpenSeekMessage } from "@openseek/provider";
import { runSession } from "@openseek/session";
import type { AgentHandle, AgentResult, AgentSpawnDeps, AgentSpawnRequest } from "./types.ts";

const DEFAULT_TIMEOUT_MS = 60_000;
const ID_BYTES = 6;

function newId(): string {
  // Random hex id — sufficient for log correlation; no collision domain.
  const bytes = crypto.getRandomValues(new Uint8Array(ID_BYTES));
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}

/**
 * Fork an in-process child session. Returns an `AgentHandle`; the caller
 * may `await handle.result` for the final `AgentResult` or call `handle.abort()`
 * to cancel cooperatively.
 */
export function spawnAgent(req: AgentSpawnRequest, deps: AgentSpawnDeps): AgentHandle {
  const id = newId();
  const start = Date.now();
  const controller = new AbortController();
  const timeoutMs = req.timeoutMs ?? DEFAULT_TIMEOUT_MS;

  const userMsg: OpenSeekMessage = {
    role: "user",
    content: [{ type: "text", text: req.prompt }],
  };

  // Independent message buffer + state — parent's transcript stays untouched.
  const state = {
    messages: [userMsg],
    mode: "agent" as const,
    reasoningEffort: "off" as const,
    model: deps.model,
    provider: deps.provider.id,
  };

  let timedOut = false;
  const timer = setTimeout(() => {
    timedOut = true;
    controller.abort();
  }, timeoutMs);

  const result = runChild(req, deps, state, controller.signal, () => timedOut)
    .then<AgentResult>((outcome) => {
      clearTimeout(timer);
      return { id, ...outcome, ms: Date.now() - start };
    })
    .catch<AgentResult>((err) => {
      clearTimeout(timer);
      const message = err instanceof Error ? err.message : String(err);
      return {
        id,
        status: "failed",
        output: "",
        error: message,
        ms: Date.now() - start,
      };
    });

  return {
    id,
    abort: () => controller.abort(),
    result,
  };
}

async function runChild(
  req: AgentSpawnRequest,
  deps: AgentSpawnDeps,
  state: Parameters<typeof runSession>[0],
  signal: AbortSignal,
  isTimedOut: () => boolean,
): Promise<Omit<AgentResult, "id" | "ms">> {
  const chunks: string[] = [];
  let errored: unknown;
  let cancelled = false;
  let finished = false;

  const gen = runSession(state, {
    provider: deps.provider,
    model: deps.model,
    tools: deps.tools,
    capability: deps.capability,
    signal,
    apiKey: deps.apiKey,
    baseURL: deps.baseURL,
    cwd: deps.cwd,
    maxSteps: req.maxSteps,
  });

  for await (const ev of gen) {
    if (ev.type === "text-delta") chunks.push(ev.delta);
    else if (ev.type === "error") errored = ev.err;
    else if (ev.type === "cancelled") cancelled = true;
    else if (ev.type === "turn-end") finished = true;
  }

  const output = chunks.join("");
  if (isTimedOut()) return { status: "timeout", output };
  if (cancelled) return { status: "cancelled", output };
  if (errored !== undefined) {
    const message = errored instanceof Error ? errored.message : String(errored);
    return { status: "failed", output, error: message };
  }
  if (finished) return { status: "done", output };
  return { status: "failed", output, error: "no terminal event" };
}
