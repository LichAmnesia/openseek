/** @jsxImportSource @opentui/solid */
// Regression test for Bug 3.4 — End / Home keys consumed by Textarea, never
// reach App's useKeyboard scroll handler.
//
// Root cause: opentui's Textarea (the base class for Input) maps `home` /
// `end` to `buffer-home` / `buffer-end` actions by default. Those actions
// have a registered handler that returns `true`, which signals the keypress
// was consumed → useKeyboard never sees the event → the App.tsx
// `jumpToBottom(scrollBox)` / `jumpToTop(scrollBox)` paths are dead.
//
// Fix: Composer now passes `keyBindings` overrides that map `home` and
// `end` (with and without shift) to a synthetic action name with no handler
// in `_actionHandlers`. handleKeyPress falls through, returns false, the
// keys bubble up to App's useKeyboard.
//
// We assert TWO things here:
//   1. The exported `composerKeyBindings` array has the right shape.
//   2. End-to-end: mount App, focus the input, press End → App's
//      `useKeyboard` handler observes `name === "end"` and calls
//      jumpToBottom on the scroll box.

import { test, expect, describe } from "bun:test";
import { createSignal, type Accessor } from "solid-js";
import { useKeyboard, testRender } from "@opentui/solid";
import { composerKeyBindings, Composer } from "../src/components/Composer.tsx";
import type { TuiActions, TuiStatus } from "../src/types.ts";

describe("composerKeyBindings shape", () => {
  test("contains end + home overrides (with and without shift)", () => {
    const names = composerKeyBindings.map((b) => `${b.name}:${b.shift ? 1 : 0}`);
    expect(names).toContain("end:0");
    expect(names).toContain("home:0");
    expect(names).toContain("end:1");
    expect(names).toContain("home:1");
  });

  test("home/end overrides use a synthetic action (not buffer-home/buffer-end)", () => {
    // The default Textarea binding maps home → buffer-home. We must NOT
    // re-bind to that exact action — that's the whole point. Any string
    // that's not in `_actionHandlers` is fine; we use "noop-bubble".
    for (const b of composerKeyBindings) {
      if (b.name !== "home" && b.name !== "end") continue;
      expect(b.action).not.toBe("buffer-home");
      expect(b.action).not.toBe("buffer-end");
      expect(typeof b.action).toBe("string");
      expect(b.action.length).toBeGreaterThan(0);
    }
  });

  test("re-includes Input's submit bindings so Enter still submits", () => {
    // Regression: opentui's runtime `set keyBindings` setter merges only
    // with `defaultTextareaKeyBindings` — it does NOT know about
    // InputRenderable's prepended `{return → submit}` / `{linefeed →
    // submit}` bindings. If we omit them here, Solid's prop reconcile
    // overwrites them, return reverts to Textarea's `newline` action,
    // Input.newLine() returns false, and Enter becomes a no-op.
    const actions = composerKeyBindings.map((b) => `${b.name}:${b.action}`);
    expect(actions).toContain("return:submit");
    expect(actions).toContain("linefeed:submit");
  });
});

// ---------- end-to-end: keys bubble to useKeyboard ----------

interface KeyObserver {
  observed: Array<{ name: string; shift?: boolean }>;
}

// A minimal harness that mounts <Composer> + a useKeyboard observer, like
// App.tsx does. We're not mounting the full <App> here because Splash + the
// scroll box rely on a render with non-trivial dimensions that are flaky
// across Bun test runs; the property under test is just "keystroke reaches
// useKeyboard above the input".
function Harness(props: { observer: KeyObserver; actions: TuiActions; status: () => TuiStatus }) {
  useKeyboard((evt) => {
    props.observer.observed.push({ name: evt.name, shift: evt.shift });
  });
  return (
    <box flexDirection="column" flexGrow={1}>
      <Composer
        actions={props.actions}
        status={props.status}
        mode="agent"
        provider="mikan"
        model="deepseek-v4-flash"
      />
    </box>
  );
}

test("End key bubbles past Composer Input → useKeyboard observes it", async () => {
  const observer: KeyObserver = { observed: [] };
  const [status] = createSignal<TuiStatus>("idle") as [Accessor<TuiStatus>, unknown];
  const actions: TuiActions = {
    onSubmit: () => {},
    onCancel: () => {},
    onExit: async () => {},
    onModeChange: () => {},
    onEffortChange: () => {},
  };
  const setup = await testRender(
    () => <Harness observer={observer} actions={actions} status={status} />,
    {
      width: 60,
      height: 12,
    },
  );
  await setup.renderOnce();
  await new Promise<void>((r) => process.nextTick(r));
  await setup.renderOnce();

  // Press End. Pre-fix: the Input/Textarea consumed this and useKeyboard
  // never fired. Post-fix: the synthetic action name has no handler in
  // _actionHandlers → handleKeyPress falls through → key bubbles up.
  setup.mockInput.pressKey("END");
  await setup.renderOnce();

  const ends = observer.observed.filter((e) => e.name === "end");
  expect(ends.length).toBeGreaterThan(0);
});

test("Home key bubbles past Composer Input → useKeyboard observes it", async () => {
  const observer: KeyObserver = { observed: [] };
  const [status] = createSignal<TuiStatus>("idle") as [Accessor<TuiStatus>, unknown];
  const actions: TuiActions = {
    onSubmit: () => {},
    onCancel: () => {},
    onExit: async () => {},
    onModeChange: () => {},
    onEffortChange: () => {},
  };
  const setup = await testRender(
    () => <Harness observer={observer} actions={actions} status={status} />,
    {
      width: 60,
      height: 12,
    },
  );
  await setup.renderOnce();
  await new Promise<void>((r) => process.nextTick(r));
  await setup.renderOnce();

  setup.mockInput.pressKey("HOME");
  await setup.renderOnce();

  const homes = observer.observed.filter((e) => e.name === "home");
  expect(homes.length).toBeGreaterThan(0);
});

test("Composer publishes input changes and clears after submit", async () => {
  const [status] = createSignal<TuiStatus>("idle") as [Accessor<TuiStatus>, unknown];
  const changes: string[] = [];
  const submits: string[] = [];
  const actions: TuiActions = {
    onSubmit: (text) => submits.push(text),
    onCancel: () => {},
    onExit: async () => {},
    onInputChange: (text) => changes.push(text),
  };
  const setup = await testRender(
    () => <Harness observer={{ observed: [] }} actions={actions} status={status} />,
    {
      width: 60,
      height: 12,
    },
  );
  await setup.renderOnce();
  await setup.mockInput.typeText("abc");
  await setup.renderOnce();

  expect(changes.at(-1)).toBe("abc");

  setup.mockInput.pressEnter();
  await setup.renderOnce();

  expect(submits).toEqual(["abc"]);
  expect(changes.at(-1)).toBe("");
});

test("Composer passes raw slash submit text before clearing", async () => {
  const [status] = createSignal<TuiStatus>("idle") as [Accessor<TuiStatus>, unknown];
  const changes: string[] = [];
  const slashSubmits: Array<{ type: string; raw: string }> = [];
  const actions: TuiActions = {
    onSubmit: () => {},
    onCancel: () => {},
    onExit: async () => {},
    onInputChange: (text) => changes.push(text),
    onSlashCommand: (cmd, raw) => slashSubmits.push({ type: cmd.type, raw }),
  };
  const setup = await testRender(
    () => <Harness observer={{ observed: [] }} actions={actions} status={status} />,
    {
      width: 60,
      height: 12,
    },
  );
  await setup.renderOnce();
  await setup.mockInput.typeText("/MODEL arg ");
  await setup.renderOnce();

  setup.mockInput.pressEnter();
  await setup.renderOnce();

  expect(slashSubmits).toEqual([{ type: "model", raw: "/MODEL arg " }]);
  expect(changes.at(-1)).toBe("");
});
