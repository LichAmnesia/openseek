// Regression test for Bug 3.1 — process listeners leak on every /model
// switch. Pre-fix, runInteractive registered process.on("exit", ...) and
// process.on("SIGTERM", ...) per call. After ~10 cycles Node printed
// MaxListenersExceededWarning. The fix in `lifecycle.ts` registers exactly
// ONE pair of listeners for the whole process and swaps a resolver slot on
// each runInteractive entry.

import { test, expect, beforeEach, afterAll } from "bun:test";
import {
  attachProcessSignals,
  createInflightTracker,
  waitForInflight,
  _resetLifecycleForTests,
} from "../src/lifecycle.ts";

beforeEach(() => {
  _resetLifecycleForTests();
});

afterAll(() => {
  _resetLifecycleForTests();
});

test("attachProcessSignals registers exactly ONE SIGTERM + SIGINT listener no matter how many cycles", () => {
  // F5 P1: 'exit' is intentionally NOT registered (event loop is dead by
  // the time it fires; resolver can't do anything async).
  const beforeExit = process.listenerCount("exit");
  const beforeTerm = process.listenerCount("SIGTERM");
  const beforeInt = process.listenerCount("SIGINT");

  // Simulate 15 runInteractive entries. Each entry calls attachProcessSignals
  // and immediately installs + clears a resolver, then "settles" (the
  // resolver is detached on settle).
  for (let i = 0; i < 15; i++) {
    const setSignalResolver = attachProcessSignals();
    const settle = () => {
      /* noop */
    };
    setSignalResolver(settle);
    // Simulate the "settle" path detaching the resolver.
    setSignalResolver(undefined);
  }

  // Zero new 'exit' listeners (we dropped that hook in F5 P1).
  expect(process.listenerCount("exit") - beforeExit).toBe(0);
  // Exactly one SIGTERM and one SIGINT listener got added by attach (idempotent).
  expect(process.listenerCount("SIGTERM") - beforeTerm).toBe(1);
  expect(process.listenerCount("SIGINT") - beforeInt).toBe(1);
});

test("attachProcessSignals across 30 cycles never trips MaxListenersExceededWarning baseline", () => {
  // Capture listener count BEFORE the lifecycle module touches anything,
  // run the cycle, and assert we stayed within a small constant.
  const startExit = process.listenerCount("exit");
  const startTerm = process.listenerCount("SIGTERM");
  const startInt = process.listenerCount("SIGINT");

  for (let i = 0; i < 30; i++) {
    const setSignalResolver = attachProcessSignals();
    setSignalResolver(() => {});
    setSignalResolver(undefined);
  }

  // F5 P1: we explicitly do NOT add an 'exit' listener anymore.
  expect(process.listenerCount("exit") - startExit).toBe(0);
  expect(process.listenerCount("SIGTERM") - startTerm).toBeLessThanOrEqual(1);
  expect(process.listenerCount("SIGINT") - startInt).toBeLessThanOrEqual(1);
});

test("F5 P1: SIGINT triggers the active resolver (Ctrl+C fallback)", () => {
  const calls: number[] = [];
  const setSignalResolver = attachProcessSignals();
  setSignalResolver(() => calls.push(99));
  process.emit("SIGINT");
  expect(calls).toEqual([99]);
});

test("F5 P1: _resetLifecycleForTests removes ONLY the closures we registered (preserves other listeners)", () => {
  // Simulate a third-party listener (e.g. test runner) registered BEFORE
  // attachProcessSignals. After the lifecycle reset, that listener must
  // survive — the pre-fix `removeAllListeners` would have nuked it.
  let foreignFired = 0;
  const foreign = () => {
    foreignFired += 1;
  };
  process.on("SIGTERM", foreign);
  process.on("SIGINT", foreign);
  try {
    const beforeTerm = process.listenerCount("SIGTERM");
    const beforeInt = process.listenerCount("SIGINT");

    const setSignalResolver = attachProcessSignals();
    setSignalResolver(() => {});

    expect(process.listenerCount("SIGTERM") - beforeTerm).toBe(1);
    expect(process.listenerCount("SIGINT") - beforeInt).toBe(1);

    _resetLifecycleForTests();
    // Foreign listener still attached.
    expect(process.listenerCount("SIGTERM") - beforeTerm).toBe(0);
    expect(process.listenerCount("SIGINT") - beforeInt).toBe(0);
    process.emit("SIGTERM");
    expect(foreignFired).toBe(1);
  } finally {
    process.off("SIGTERM", foreign);
    process.off("SIGINT", foreign);
  }
});

test("the singleton SIGTERM listener fires the currently-active resolver", () => {
  const calls: number[] = [];
  const setSignalResolver = attachProcessSignals();
  setSignalResolver(() => calls.push(1));

  // Swap the resolver — this is what runInteractive does on a /model switch.
  setSignalResolver(() => calls.push(2));

  // Now simulate process emitting SIGTERM — only the LATEST resolver should fire.
  process.emit("SIGTERM");
  expect(calls).toEqual([2]);
});

test("clearing the resolver slot makes the singleton listener a no-op", () => {
  const calls: number[] = [];
  const setSignalResolver = attachProcessSignals();
  setSignalResolver(() => calls.push(1));
  setSignalResolver(undefined); // session settled, detached
  process.emit("SIGTERM");
  expect(calls).toEqual([]);
});

// Bug 3.3 helper coverage — `waitForInflight` is the drain helper used by
// the slash-command tear-down path. Not strictly Bug 3.1, but lives in the
// same file so testing here keeps the lifecycle surface in one place.

test("waitForInflight returns immediately when getPromise() returns null", async () => {
  const start = Date.now();
  await waitForInflight(() => null, 1000);
  expect(Date.now() - start).toBeLessThan(50);
});

test("waitForInflight resolves when the inflight promise settles", async () => {
  let settle: () => void;
  const p = new Promise<void>((r) => {
    settle = r;
  });
  const wait = waitForInflight(() => p, 5000);
  setTimeout(() => settle?.(), 30);
  const start = Date.now();
  await wait;
  expect(Date.now() - start).toBeLessThan(500);
});

test("waitForInflight times out cleanly when the promise hangs forever", async () => {
  const hung = new Promise<void>(() => {});
  const start = Date.now();
  await waitForInflight(() => hung, 80);
  const elapsed = Date.now() - start;
  // Tolerate scheduler jitter — 60-300ms range covers slow CI.
  expect(elapsed).toBeGreaterThanOrEqual(60);
  expect(elapsed).toBeLessThan(500);
});

// F5 P0-GAP #3 — race-safe inflight tracker.

test("F5 P0-GAP #3: inflight.track keeps newer promise; older finally is a no-op for slot", async () => {
  const tracker = createInflightTracker();
  let resolve1: () => void = () => {};
  let resolve2: () => void = () => {};
  const p1 = new Promise<void>((r) => {
    resolve1 = r;
  });
  const p2 = new Promise<void>((r) => {
    resolve2 = r;
  });
  tracker.track(p1);
  expect(tracker.current()).toBe(p1);
  // User resubmits before p1 has settled — slot now points at p2.
  tracker.track(p2);
  expect(tracker.current()).toBe(p2);
  // p1 settles first. Its finally MUST NOT clobber the slot — slot still p2.
  resolve1();
  await Promise.resolve(); // let microtasks run
  await Promise.resolve();
  expect(tracker.current()).toBe(p2);
  // p2 settles → slot clears.
  resolve2();
  await Promise.resolve();
  await Promise.resolve();
  expect(tracker.current()).toBe(null);
});

test("F5 P0-GAP #3: waitForInflight() drains the LATEST tracked promise after a resubmit race", async () => {
  const tracker = createInflightTracker();
  let resolveT2: () => void = () => {};
  const t1 = Promise.resolve();
  const t2 = new Promise<void>((r) => {
    resolveT2 = r;
  });
  tracker.track(t1);
  // Immediately track t2 BEFORE the microtask that would null-out from t1.
  tracker.track(t2);
  // After microtasks for t1's finally — slot must still be t2 (not null).
  await Promise.resolve();
  await Promise.resolve();
  expect(tracker.current()).toBe(t2);

  // waitForInflight should actually wait for t2 (not no-op).
  const start = Date.now();
  const p = waitForInflight(() => tracker.current(), 1000);
  setTimeout(() => resolveT2(), 50);
  await p;
  const elapsed = Date.now() - start;
  expect(elapsed).toBeGreaterThanOrEqual(40);
  expect(elapsed).toBeLessThan(500);
});

test("F5 P0-GAP #3: tracker swallows rejection (programmer error) without unhandled rejection", async () => {
  const tracker = createInflightTracker();
  // Track a rejecting promise. The tracker's `.catch` should swallow it.
  const rejected = Promise.reject(new Error("boom"));
  tracker.track(rejected);
  // Settle microtasks; if the rejection were unhandled, Node would warn.
  await Promise.resolve();
  await Promise.resolve();
  await Promise.resolve();
  // Slot must clear after the rejected promise settles.
  expect(tracker.current()).toBe(null);
});
