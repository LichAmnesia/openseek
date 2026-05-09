// Lifecycle helpers for the interactive runtime.
//
// Two concerns live here so `interactive.ts` stays under the 250-LOC budget:
//
// 1. EPOCH TOKENS (Bug 3.2 + 3.3 fix)
//    Each accepted `submit`, `/clear`, or model/provider switch bumps a
//    monotonic counter. Stream events from a doomed iterator carry the epoch
//    they started under; routing.apply (in wire.ts) ignores any event whose
//    epoch is older than the current one. This drops orphaned events cleanly
//    instead of letting them mutate transcript state that the user just
//    cleared / replaced.
//
// 2. PROCESS LISTENER LIFECYCLE (Bug 3.1 fix)
//    Pre-fix, `runInteractive` registered `process.on("exit", ...)` and
//    `process.on("SIGTERM", ...)` per call and never removed them. Each
//    `/model` round-trip leaked two listeners; ~10 cycles tripped Node's
//    MaxListenersExceededWarning. The fix attaches a SINGLE listener per
//    process and routes signals into the currently-active session via a
//    swappable resolver ref. Re-mounts swap the ref; they never re-register.

export interface EpochCounter {
  /** Read the live epoch. */
  current(): number;
  /** Bump to the next epoch and return it. */
  bump(): number;
}

export function createEpochCounter(): EpochCounter {
  let n = 0;
  return {
    current: () => n,
    bump: () => ++n,
  };
}

// ---------- process-listener registry ----------

export type SessionResolver = () => void;

interface ResolverSlot {
  fn: SessionResolver | undefined;
}

let slot: ResolverSlot | undefined;
let registered = false;
// F5 P1: keep a handle on the registered closure so `_resetLifecycleForTests`
// can do a precise `process.off(event, fn)` rather than nuking ALL listeners
// on the events. Bun runs every test in one process; `removeAllListeners`
// would clobber the test-runner's own SIGINT/SIGTERM hooks.
let registeredFire: (() => void) | undefined;

/**
 * Register the process-level signal hooks ONCE per process. Repeat calls
 * are no-ops. Returns a setter the active session uses to install / clear
 * its resolver.
 *
 * F5 P1: we listen on SIGTERM and SIGINT only. The 'exit' event fires AFTER
 * the event loop is dead, so async cleanup is impossible there — the
 * resolver firing on 'exit' achieved nothing in practice. SIGINT covers
 * Ctrl+C when @opentui/core's `exitOnCtrlC: false` doesn't catch the input
 * (e.g. when the renderer is already torn down).
 *
 * The resolver is a single function that fires when the process is exiting
 * cleanly via signal — interactive.ts wires it to resolve the runInteractive
 * promise with `{ exitCode: 0 }`.
 */
export function attachProcessSignals(): (resolver: SessionResolver | undefined) => void {
  if (!slot) slot = { fn: undefined };
  if (!registered) {
    registered = true;
    const fire = () => {
      slot?.fn?.();
    };
    registeredFire = fire;
    // F5 P1: SIGTERM (graceful kill) + SIGINT (Ctrl+C fallback). We
    // intentionally OMIT 'exit' — by the time it fires the event loop is
    // dead, so async cleanup is impossible and the resolver just races a
    // doomed process.
    process.on("SIGTERM", fire);
    process.on("SIGINT", fire);
  }
  const localSlot = slot;
  return (resolver) => {
    localSlot.fn = resolver;
  };
}

// ---------- in-flight stream drain helper ----------

/**
 * Wait for the in-flight stream promise to settle, with a hard timeout.
 * Returns when either the promise drains or `ms` elapses. Used by the
 * slash-command tear-down path so the wizard can mount cleanly without
 * overlapping with the previous renderer's still-iterating async generator
 * (Bug 3.3 fix).
 */
export async function waitForInflight(
  getPromise: () => Promise<void> | null,
  ms: number,
): Promise<void> {
  const p = getPromise();
  if (!p) return;
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<void>((resolve) => {
    timer = setTimeout(resolve, ms);
  });
  try {
    await Promise.race([p, timeout]);
  } finally {
    if (timer !== undefined) clearTimeout(timer);
  }
}

/**
 * F5 P0-GAP #3: race-safe in-flight promise tracker.
 *
 * Pre-fix, interactive.ts kept a `let inflightPromise: Promise|null` and
 * each iterator's finally-block set it to null unconditionally. If the
 * user resubmitted faster than the prior iterator unwound, the older
 * finally would clobber the newer reference — `waitForInflight` would
 * see null and no-op while a generator was still draining (cancel/clear
 * tear-down then raced the live stream).
 *
 * `createInflightTracker` returns a `track(promise)` that records the
 * latest promise and only clears the slot when the EXACT promise that was
 * tracked settles. Resubmits during a still-pending settle simply replace
 * the slot; the older promise's finally is then a no-op for the slot.
 *
 * Errors are swallowed: cancellation surfaces via routing.apply, not
 * throw. The `.catch` here only catches programmer errors; finally still
 * fires either way so identity-clearing remains correct.
 */
export interface InflightTracker {
  /** Read the current in-flight promise. */
  current(): Promise<void> | null;
  /** Track a new in-flight promise; clears the slot when this exact promise settles. */
  track(p: Promise<void>): void;
}

export function createInflightTracker(): InflightTracker {
  let active: Promise<void> | null = null;
  return {
    current: () => active,
    track(p: Promise<void>) {
      active = p;
      p.finally(() => {
        if (active === p) active = null;
      }).catch(() => {
        // swallow — see jsdoc above.
      });
    },
  };
}

/**
 * Test-only: tear down the singleton listeners and clear the slot. Real
 * production code never calls this. Tests use it between runs to verify the
 * idempotency of `attachProcessSignals` without leaking handlers across
 * suites.
 *
 * F5 P1: precisely `process.off(event, fn)` the closure we registered.
 * Pre-fix used `removeAllListeners` which clobbered the Bun test-runner's
 * own SIGINT/SIGTERM hooks. Cross-test interference was the symptom.
 */
export function _resetLifecycleForTests(): void {
  if (registeredFire) {
    process.off("SIGTERM", registeredFire);
    process.off("SIGINT", registeredFire);
    registeredFire = undefined;
  }
  slot = undefined;
  registered = false;
}
