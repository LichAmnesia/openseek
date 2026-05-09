/** @jsxImportSource @opentui/solid */

import { expect, test } from "bun:test";
import { createSignal } from "solid-js";
import { testRender } from "@opentui/solid";
import { App } from "../src/App.tsx";
import type {
  ToolApprovalState,
  TranscriptMessage,
  TuiActions,
  TuiStatus,
} from "../src/types.ts";

function makeActions(exitCalls: { count: number }): TuiActions {
  return {
    onSubmit: () => {},
    onCancel: () => {},
    onExit: async () => {
      exitCalls.count += 1;
    },
  };
}

test("Ctrl+D exits only after a second empty-composer press", async () => {
  const [messages] = createSignal<TranscriptMessage[]>([]);
  const [status] = createSignal<TuiStatus>("idle");
  const [currentInput, setCurrentInput] = createSignal("");
  const exitCalls = { count: 0 };
  const setup = await testRender(
    () => (
      <App
        state={{ messages, status, currentInput }}
        actions={makeActions(exitCalls)}
        provider="mikan"
        model="deepseek-v4-flash"
        mode="agent"
        splashMs={0}
      />
    ),
    { width: 80, height: 16 },
  );
  await setup.renderOnce();

  setCurrentInput("draft");
  setup.mockInput.pressKey("d", { ctrl: true });
  await setup.renderOnce();
  expect(exitCalls.count).toBe(0);

  setCurrentInput("");
  setup.mockInput.pressKey("d", { ctrl: true });
  await setup.renderOnce();
  expect(exitCalls.count).toBe(0);

  setup.mockInput.pressKey("d", { ctrl: true });
  await setup.renderOnce();
  expect(exitCalls.count).toBe(1);
});

test("Ctrl+D double-exit arm resets after non-empty input", async () => {
  const [messages] = createSignal<TranscriptMessage[]>([]);
  const [status] = createSignal<TuiStatus>("idle");
  const [currentInput, setCurrentInput] = createSignal("");
  const exitCalls = { count: 0 };
  const setup = await testRender(
    () => (
      <App
        state={{ messages, status, currentInput }}
        actions={makeActions(exitCalls)}
        provider="mikan"
        model="deepseek-v4-flash"
        mode="agent"
        splashMs={0}
      />
    ),
    { width: 80, height: 16 },
  );
  await setup.renderOnce();

  setup.mockInput.pressKey("d", { ctrl: true });
  await setup.renderOnce();
  expect(exitCalls.count).toBe(0);

  setCurrentInput("draft");
  await setup.renderOnce();
  setCurrentInput("");
  await setup.renderOnce();

  setup.mockInput.pressKey("d", { ctrl: true });
  await setup.renderOnce();
  expect(exitCalls.count).toBe(0);

  setup.mockInput.pressKey("d", { ctrl: true });
  await setup.renderOnce();
  expect(exitCalls.count).toBe(1);
});

test("pending approval prompt resolves with y/n keys", async () => {
  const [messages] = createSignal<TranscriptMessage[]>([]);
  const [status] = createSignal<TuiStatus>("streaming");
  const [currentInput] = createSignal("");
  const [approval, setApproval] = createSignal<ToolApprovalState | null>({
    id: "call-1",
    toolName: "edit",
    args: { path: "x.ts" },
    permission: "deny-in-plan" as const,
  });
  const decisions: boolean[] = [];
  const setup = await testRender(
    () => (
      <App
        state={{ messages, status, currentInput, approval }}
        actions={{
          ...makeActions({ count: 0 }),
          onApprovalDecision: (approved) => decisions.push(approved),
        }}
        provider="mikan"
        model="deepseek-v4-flash"
        mode="agent"
        splashMs={0}
      />
    ),
    { width: 80, height: 16 },
  );
  await setup.renderOnce();

  setup.mockInput.pressKey("y");
  await setup.renderOnce();
  expect(decisions).toEqual([true]);

  setApproval({
    id: "call-2",
    toolName: "bash",
    args: { command: "pwd" },
    permission: "deny-in-plan",
  });
  setup.mockInput.pressKey("n");
  await setup.renderOnce();
  expect(decisions).toEqual([true, false]);
});
