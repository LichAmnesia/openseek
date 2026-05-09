// Reflective-Language-Model fan-out (G3.2).
//
// `runRlm` dispatches up to N parallel `RlmRunner` calls, batched by
// `maxParallel`. Each worker is wrapped so a single failure surfaces as
// `[error: <msg>]` in its result slot rather than rejecting the whole
// fan-out — this matches the SPEC contract that one bad child must not
// poison the others.
//
// v0.3 ships with mock runners; v0.5+ swaps in a cheap LLM client.

import type { RlmResult, RlmRunner, RunRlmOptions } from "./types.ts";

export const DEFAULT_RLM_MAX_PARALLEL = 16;

/**
 * Run `queries` through `runner` with bounded parallelism.
 * Output order matches input order.
 */
export async function runRlm(queries: string[], opts: RunRlmOptions): Promise<RlmResult[]> {
  const max = Math.max(1, Math.min(opts.maxParallel ?? DEFAULT_RLM_MAX_PARALLEL, queries.length));
  const results = new Array<RlmResult>(queries.length);
  let cursor = 0;

  // The outer signal lets callers cancel all in-flight workers; each
  // worker also receives it so cooperative runners can short-circuit.
  const signal = opts.signal ?? new AbortController().signal;

  async function worker(): Promise<void> {
    while (true) {
      const i = cursor;
      cursor += 1;
      if (i >= queries.length) return;
      const query = queries[i] as string;
      results[i] = await execOne(query, opts.runner, signal);
    }
  }

  const workers: Promise<void>[] = [];
  for (let w = 0; w < max; w += 1) workers.push(worker());
  await Promise.all(workers);
  return results;
}

async function execOne(query: string, runner: RlmRunner, signal: AbortSignal): Promise<RlmResult> {
  const start = Date.now();
  try {
    const response = await runner(query, signal);
    return { query, response, ms: Date.now() - start };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return { query, response: `[error: ${message}]`, ms: Date.now() - start };
  }
}

/**
 * Default v0.3 mock runner — returns a deterministic stub response so the
 * tool layer can test fan-out without an API key.
 */
export const mockRunner: RlmRunner = async (query) => {
  return `[mock response for: ${query}]`;
};
