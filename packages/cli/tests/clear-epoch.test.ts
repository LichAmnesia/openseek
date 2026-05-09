// Regression tests for Bug 3.2 (the `/clear` race) and Bug 3.3 (the
// slash-command stream race). Both bugs share root cause: the streaming
// async iterator keeps yielding events AFTER the user typed `/clear` /
// `/model` / `/provider`, and routing.apply mutates the freshly-cleared
// state with stale data.
//
// Fix: routing has an epoch counter; submit captures it; /clear (etc.)
// bumps it; routing.apply drops events whose epoch doesn't match. We test
// the ROUTING contract here (event-drop on epoch mismatch) plus the
// dispatchSlash ordering (epoch bump before the abort + clear), since
// driving a real runInteractive in a test is too involved.

import { test, expect } from "bun:test";
import type { TranscriptMessage } from "@openseek/tui";
import type { OpenSeekMessage } from "@openseek/provider";
import type { StreamEvent } from "@openseek/session";
import { createRouting } from "../src/wire.ts";
import { dispatchSlash } from "../src/runtime-switch.ts";
import type { SlashContext } from "../src/runtime-switch.ts";
import type { InteractiveOpts, InteractiveResult } from "../src/interactive.ts";
import { defaultProvider } from "@openseek/provider";

interface Captured {
  rows: TranscriptMessage[];
  textAppends: string[];
  thinkingAppends: string[];
  statuses: string[];
  history: OpenSeekMessage[][];
}

function makeRouting() {
  const cap: Captured = {
    rows: [],
    textAppends: [],
    thinkingAppends: [],
    statuses: [],
    history: [],
  };
  const routing = createRouting({
    appendRow: (r) => cap.rows.push(r),
    updateLastAssistantText: (t) => cap.textAppends.push(t),
    updateLastAssistantThinking: (t) => cap.thinkingAppends.push(t),
    setStatus: (s) => cap.statuses.push(s),
    appendHistory: (msgs) => cap.history.push(msgs),
  });
  return { routing, cap };
}

// ---------- Bug 3.2: routing.apply drops events with stale epoch ----------

test("routing.apply with no epoch arg behaves like before (back-compat)", () => {
  const { routing, cap } = makeRouting();
  routing.apply({ type: "text-delta", delta: "hi" });
  expect(cap.textAppends).toEqual(["hi"]);
});

test("routing.apply with matching epoch applies the event", () => {
  const { routing, cap } = makeRouting();
  const turn = routing.epoch();
  routing.apply({ type: "text-delta", delta: "hi" }, turn);
  expect(cap.textAppends).toEqual(["hi"]);
});

test("routing.bumpEpoch drops events captured at older epoch (the /clear race)", () => {
  const { routing, cap } = makeRouting();
  const turnEpoch = routing.epoch();
  // Simulate: stream is mid-flight, user types /clear → bumpEpoch fires.
  routing.bumpEpoch();
  // Now the iterator yields a text-delta + a cancelled event. Both should
  // be dropped because they carry the OLD epoch.
  routing.apply({ type: "text-delta", delta: "stale-fragment" }, turnEpoch);
  routing.apply({ type: "cancelled" }, turnEpoch);
  expect(cap.textAppends).toEqual([]);
  expect(cap.statuses).toEqual([]);
  expect(cap.rows).toEqual([]);
});

test("after epoch bump, NEW submit at fresh epoch routes events normally", () => {
  const { routing, cap } = makeRouting();
  const turn1 = routing.epoch();
  routing.bumpEpoch(); // /clear fires
  const turn2 = routing.epoch();
  expect(turn2).not.toBe(turn1);

  // Stale events from turn1 still drop:
  routing.apply({ type: "text-delta", delta: "old" }, turn1);
  expect(cap.textAppends).toEqual([]);

  // Fresh events from turn2 land:
  routing.apply({ type: "text-delta", delta: "new" }, turn2);
  expect(cap.textAppends).toEqual(["new"]);
});

test("two accepted submits use distinct epochs; stale turn1 events cannot mutate turn2", () => {
  const { routing, cap } = makeRouting();
  const turn1 = routing.bumpEpoch();
  routing.apply({ type: "text-delta", delta: "turn1-start" }, turn1);
  expect(cap.textAppends).toEqual(["turn1-start"]);

  const turn2 = routing.bumpEpoch();
  expect(turn2).not.toBe(turn1);
  routing.apply({ type: "text-delta", delta: "-stale" }, turn1);
  routing.apply({
    type: "assistant-turn",
    messages: [{ role: "assistant", content: [{ type: "text", text: "stale" }] }],
  }, turn1);
  routing.apply({ type: "text-delta", delta: "turn2" }, turn2);

  expect(cap.textAppends).toEqual(["turn1-start", "turn2"]);
  expect(cap.history).toEqual([]);
});

test("routing.dispose flips a kill switch — subsequent apply()s are no-ops", () => {
  const { routing, cap } = makeRouting();
  routing.dispose();
  routing.apply({ type: "text-delta", delta: "should not land" });
  routing.apply({ type: "cancelled" });
  expect(cap.textAppends).toEqual([]);
  expect(cap.statuses).toEqual([]);
});

// ---------- Bug 3.2 end-to-end via dispatchSlash for /clear ----------

interface MockSlashHarness {
  ctx: SlashContext;
  log: string[];
  inflightSettled: boolean;
  triggerInflightSettle: () => void;
}

function makeSlashHarness(): MockSlashHarness {
  const log: string[] = [];
  let resolveInflight!: () => void;
  const inflight = new Promise<void>((r) => {
    resolveInflight = r;
  });
  const harness: MockSlashHarness = {
    log,
    inflightSettled: false,
    triggerInflightSettle: () => {
      if (!harness.inflightSettled) {
        harness.inflightSettled = true;
        resolveInflight();
      }
    },
    ctx: {
      current: { provider: defaultProvider(), modelId: "x", apiKey: "k" } as InteractiveOpts,
      abortInflight: () => log.push("abortInflight"),
      bumpEpoch: () => {
        log.push("bumpEpoch");
        return 1;
      },
      awaitInflight: () => {
        log.push("awaitInflight:start");
        return inflight.then(() => {
          log.push("awaitInflight:end");
        });
      },
      destroyMount: async () => {
        log.push("destroyMount");
      },
      appendRow: (row) =>
        log.push(row.kind === "system" ? `appendRow:${row.text}` : "appendRow"),
      clearMessages: () => log.push("clearMessages"),
      resolveResult: (r: InteractiveResult) => log.push(`resolve:${r.exitCode}`),
    },
  };
  return harness;
}

test("dispatchSlash(clear) bumps epoch BEFORE abort+clear (the order matters)", async () => {
  const h = makeSlashHarness();
  await dispatchSlash(h.ctx, { type: "clear", args: [] });
  // Epoch bump must fire first; otherwise a stale event slipping through
  // BETWEEN abort and the /clear handler running could touch state.
  const order = h.log;
  expect(order[0]).toBe("bumpEpoch");
  expect(order[1]).toBe("abortInflight");
  expect(order[2]).toBe("clearMessages");
});

test("dispatchSlash(quit) drains in-flight before destroying the mount", async () => {
  const h = makeSlashHarness();
  // Kick off the dispatch — it will wait at awaitInflight.
  const dispatchP = dispatchSlash(h.ctx, { type: "quit", args: [] });
  // Give the dispatch a tick to reach awaitInflight.
  await new Promise((r) => setTimeout(r, 10));
  expect(h.log).toContain("awaitInflight:start");
  expect(h.log).not.toContain("destroyMount");
  // Simulate the iterator settling.
  h.triggerInflightSettle();
  await dispatchP;
  // destroyMount must come AFTER awaitInflight ends.
  const drainEnd = h.log.indexOf("awaitInflight:end");
  const destroy = h.log.indexOf("destroyMount");
  expect(drainEnd).toBeGreaterThanOrEqual(0);
  expect(destroy).toBeGreaterThan(drainEnd);
});

test("dispatchSlash(model) drains in-flight before destroying the mount (Bug 3.3)", async () => {
  const h = makeSlashHarness();
  // We can't easily test the wizard launch here (it would mount a real
  // CliRenderer). Instead, settle the in-flight immediately; verify the
  // bumpEpoch + abortInflight + awaitInflight + destroyMount sequence
  // happens in that order BEFORE runtimeSwitch tries to mount the wizard.
  h.triggerInflightSettle();
  // Stub destroyMount to throw AFTER its log line so we don't actually
  // descend into runWizard (which needs a real terminal).
  let destroyCalled = false;
  h.ctx.destroyMount = async () => {
    destroyCalled = true;
    h.log.push("destroyMount");
    throw new Error("STOP-BEFORE-WIZARD");
  };
  await expect(dispatchSlash(h.ctx, { type: "model", args: [] })).rejects.toThrow(
    "STOP-BEFORE-WIZARD",
  );
  const bump = h.log.indexOf("bumpEpoch");
  const abort = h.log.indexOf("abortInflight");
  const drainStart = h.log.indexOf("awaitInflight:start");
  const drainEnd = h.log.indexOf("awaitInflight:end");
  const destroy = h.log.indexOf("destroyMount");
  expect(bump).toBeGreaterThanOrEqual(0);
  expect(abort).toBeGreaterThan(bump);
  expect(drainStart).toBeGreaterThan(abort);
  expect(drainEnd).toBeGreaterThan(drainStart);
  expect(destroy).toBeGreaterThan(drainEnd);
  expect(destroyCalled).toBe(true);
});

test("dispatchSlash(command) runs generic registry commands and appends text", async () => {
  const h = makeSlashHarness();
  h.ctx.runCommand = async (name, args) => ({
    kind: "text",
    payload: { text: `${name}:${args.join(",")}` },
  });

  await dispatchSlash(h.ctx, { type: "command", name: "doctor", args: ["--fast"] });

  expect(h.log).toContain("appendRow:doctor:--fast");
});

test("dispatchSlash(command) applies live mode and effort actions", async () => {
  const h = makeSlashHarness();
  const modeChanges: string[] = [];
  const effortChanges: string[] = [];
  h.ctx.setMode = (mode) => modeChanges.push(mode);
  h.ctx.setEffort = (effort) => effortChanges.push(effort);
  h.ctx.runCommand = async (name) =>
    name === "plan"
      ? {
          kind: "action",
          payload: { action: "enter-plan-mode", text: "entered plan mode." },
        }
      : {
          kind: "action",
          payload: { action: "set-effort", text: "effort → high", data: { effort: "high" } },
        };

  await dispatchSlash(h.ctx, { type: "command", name: "plan", args: [] });
  await dispatchSlash(h.ctx, { type: "command", name: "effort", args: ["high"] });

  expect(modeChanges).toEqual(["plan"]);
  expect(effortChanges).toEqual(["max"]);
  expect(h.log).toContain("appendRow:entered plan mode.");
  expect(h.log).toContain("appendRow:effort → high");
});

// ---------- Combined scenario: simulate the full /clear race ----------

test("FULL SCENARIO: /clear during stream → empty messages + idle status", async () => {
  // Simulate the interactive.ts flow without mounting a real TUI.
  const messages: TranscriptMessage[] = [];
  const wireMessages: OpenSeekMessage[] = [];
  let status = "idle";

  const routing = createRouting({
    appendRow: (r) => messages.push(r),
    updateLastAssistantText: (t) => {
      const last = messages[messages.length - 1];
      if (last && last.kind === "assistant-text") {
        last.text += t;
      } else {
        messages.push({ id: `m${messages.length}`, kind: "assistant-text", text: t });
      }
    },
    updateLastAssistantThinking: (t) => {
      const last = messages[messages.length - 1];
      if (last && last.kind === "assistant-thinking") {
        last.text += t;
      } else {
        messages.push({ id: `m${messages.length}`, kind: "assistant-thinking", text: t });
      }
    },
    setStatus: (s) => {
      status = s;
    },
    appendHistory: (msgs) => {
      for (const m of msgs) wireMessages.push(m);
    },
  });

  // Mock provider streams a long response.
  const longStream: StreamEvent[] = [
    { type: "text-delta", delta: "first " },
    { type: "text-delta", delta: "second " },
    { type: "text-delta", delta: "third " },
    { type: "cancelled" },
  ];

  // Submit fires: capture epoch.
  status = "streaming";
  const turnEpoch = routing.epoch();

  // Iterator yields one chunk:
  const ev0 = longStream[0];
  if (!ev0) throw new Error("longStream[0] missing");
  routing.apply(ev0, turnEpoch);
  expect((messages[0] as TranscriptMessage & { text: string }).text).toBe("first ");

  // User types /clear → bumpEpoch → abortInflight → clearMessages.
  routing.bumpEpoch();
  // (abortInflight in real code aborts the AbortController; here we just
  // continue iterating — that's exactly the race we want to verify.)
  messages.length = 0;
  wireMessages.length = 0;
  status = "idle";

  // The iterator yields the remaining stale events.
  for (let i = 1; i < 4; i++) {
    const ev = longStream[i];
    if (ev) routing.apply(ev, turnEpoch);
  }

  // ASSERT: clear is preserved.
  expect(messages).toEqual([]);
  // ASSERT: status is idle (not "cancelled" — the stale cancelled event was dropped).
  expect(status).toBe("idle");

  // Second submit at fresh epoch works normally.
  const newEpoch = routing.epoch();
  expect(newEpoch).not.toBe(turnEpoch);
  status = "streaming";
  routing.apply({ type: "text-delta", delta: "second turn" }, newEpoch);
  routing.apply({ type: "turn-end" }, newEpoch);
  expect((messages[0] as TranscriptMessage & { text: string }).text).toBe("second turn");
  expect(status).toBe("idle");
});
