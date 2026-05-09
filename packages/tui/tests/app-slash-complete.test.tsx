/** @jsxImportSource @opentui/solid */

import { expect, test } from "bun:test";
import { createSignal } from "solid-js";
import { testRender } from "@opentui/solid";
import { App } from "../src/App.tsx";
import type { TranscriptMessage, TuiActions, TuiStatus } from "../src/types.ts";

function baseActions(): TuiActions {
  return {
    onSubmit: () => {},
    onCancel: () => {},
    onExit: async () => {},
  };
}

test("slash root renders visible command candidates", async () => {
  const [messages] = createSignal<TranscriptMessage[]>([]);
  const [status] = createSignal<TuiStatus>("idle");
  const [currentInput] = createSignal("/");
  const setup = await testRender(
    () => (
      <App
        state={{ messages, status, currentInput }}
        actions={baseActions()}
        provider="mikan"
        model="deepseek-v4-flash"
        mode="agent"
        splashMs={0}
      />
    ),
    { width: 90, height: 16 },
  );
  await setup.renderOnce();

  const frame = setup.captureCharFrame();
  expect(frame).toContain("/model");
  expect(frame).toContain("/provider");
  expect(frame).toContain("Tab complete");
});

test("App defaults to an immediately typable composer", async () => {
  const [messages] = createSignal<TranscriptMessage[]>([]);
  const [status] = createSignal<TuiStatus>("idle");
  const [currentInput, setCurrentInput] = createSignal("");
  const changes: string[] = [];
  const setup = await testRender(
    () => (
      <App
        state={{ messages, status, currentInput }}
        actions={{
          ...baseActions(),
          onInputChange: (text) => {
            changes.push(text);
            setCurrentInput(text);
          },
        }}
        provider="mikan"
        model="deepseek-v4-flash"
        mode="agent"
      />
    ),
    { width: 90, height: 16 },
  );
  await setup.renderOnce();

  await setup.mockInput.typeText("abc");
  await setup.renderOnce();

  expect(changes.at(-1)).toBe("abc");
  expect(currentInput()).toBe("abc");
});

test("Tab completes slash prefix instead of cycling mode", async () => {
  const [messages] = createSignal<TranscriptMessage[]>([]);
  const [status] = createSignal<TuiStatus>("idle");
  const [currentInput, setCurrentInput] = createSignal("/mo");
  const modeCalls: string[] = [];
  const changes: string[] = [];
  const setup = await testRender(
    () => (
      <App
        state={{ messages, status, currentInput }}
        actions={{
          ...baseActions(),
          onInputChange: (text) => {
            changes.push(text);
            setCurrentInput(text);
          },
          onModeChange: (mode) => modeCalls.push(mode),
        }}
        provider="mikan"
        model="deepseek-v4-flash"
        mode="agent"
        splashMs={0}
      />
    ),
    { width: 90, height: 16 },
  );
  await setup.renderOnce();

  setup.mockInput.pressKey("TAB");
  await setup.renderOnce();

  expect(changes.at(-1)).toBe("/model");
  expect(currentInput()).toBe("/model");
  expect(modeCalls).toEqual([]);
});

test("App slash completion uses the caller-provided command registry", async () => {
  const [messages] = createSignal<TranscriptMessage[]>([]);
  const [status] = createSignal<TuiStatus>("idle");
  const [currentInput, setCurrentInput] = createSignal("/do");
  const [slashCommands] = createSignal([
    { name: "/commit", description: "Commit changes" },
    { name: "/doctor", description: "Run diagnostics" },
  ]);
  const changes: string[] = [];
  const setup = await testRender(
    () => (
      <App
        state={{ messages, status, currentInput, slashCommands }}
        actions={{
          ...baseActions(),
          onInputChange: (text) => {
            changes.push(text);
            setCurrentInput(text);
          },
        }}
        provider="mikan"
        model="deepseek-v4-flash"
        mode="agent"
        splashMs={0}
      />
    ),
    { width: 90, height: 16 },
  );
  await setup.renderOnce();

  const frame = setup.captureCharFrame();
  expect(frame).toContain("/doctor");

  setup.mockInput.pressKey("TAB");
  await setup.renderOnce();
  expect(changes.at(-1)).toBe("/doctor");
  expect(currentInput()).toBe("/doctor");
});

test("App slash completion accepts fuzzy command prefixes", async () => {
  const [messages] = createSignal<TranscriptMessage[]>([]);
  const [status] = createSignal<TuiStatus>("idle");
  const [currentInput, setCurrentInput] = createSignal("/rst");
  const [slashCommands] = createSignal([
    { name: "/reset-limits", description: "Reset usage caps" },
    { name: "/resume", description: "Resume a paused session" },
  ]);
  const changes: string[] = [];
  const setup = await testRender(
    () => (
      <App
        state={{ messages, status, currentInput, slashCommands }}
        actions={{
          ...baseActions(),
          onInputChange: (text) => {
            changes.push(text);
            setCurrentInput(text);
          },
        }}
        provider="mikan"
        model="deepseek-v4-flash"
        mode="agent"
        splashMs={0}
      />
    ),
    { width: 90, height: 16 },
  );
  await setup.renderOnce();

  setup.mockInput.pressKey("TAB");
  await setup.renderOnce();
  expect(changes.at(-1)).toBe("/reset-limits");
});

test("repeated Tab cycles slash candidates from slash root", async () => {
  const [messages] = createSignal<TranscriptMessage[]>([]);
  const [status] = createSignal<TuiStatus>("idle");
  const [currentInput, setCurrentInput] = createSignal("/");
  const changes: string[] = [];
  const setup = await testRender(
    () => (
      <App
        state={{ messages, status, currentInput }}
        actions={{
          ...baseActions(),
          onInputChange: (text) => {
            changes.push(text);
            setCurrentInput(text);
          },
        }}
        provider="mikan"
        model="deepseek-v4-flash"
        mode="agent"
        splashMs={0}
      />
    ),
    { width: 90, height: 16 },
  );
  await setup.renderOnce();

  setup.mockInput.pressKey("TAB");
  await setup.renderOnce();
  setup.mockInput.pressKey("TAB");
  await setup.renderOnce();

  expect(changes).toEqual(["/model", "/provider"]);
});

test("Down at slash root cycles to next candidate (matches Tab)", async () => {
  const [messages] = createSignal<TranscriptMessage[]>([]);
  const [status] = createSignal<TuiStatus>("idle");
  const [currentInput, setCurrentInput] = createSignal("/");
  const changes: string[] = [];
  const setup = await testRender(
    () => (
      <App
        state={{ messages, status, currentInput }}
        actions={{
          ...baseActions(),
          onInputChange: (text) => {
            changes.push(text);
            setCurrentInput(text);
          },
        }}
        provider="mikan"
        model="deepseek-v4-flash"
        mode="agent"
        splashMs={0}
      />
    ),
    { width: 90, height: 16 },
  );
  await setup.renderOnce();

  setup.mockInput.pressArrow("down");
  await setup.renderOnce();
  setup.mockInput.pressArrow("down");
  await setup.renderOnce();

  expect(changes).toEqual(["/model", "/provider"]);
});

test("Up at empty composer recalls most-recent submit history", async () => {
  const [messages] = createSignal<TranscriptMessage[]>([]);
  const [status] = createSignal<TuiStatus>("idle");
  const [currentInput, setCurrentInput] = createSignal("");
  const [submitHistory] = createSignal<readonly string[]>([
    "first message",
    "second message",
    "third message",
  ]);
  const changes: string[] = [];
  const setup = await testRender(
    () => (
      <App
        state={{ messages, status, currentInput, submitHistory }}
        actions={{
          ...baseActions(),
          onInputChange: (text) => {
            changes.push(text);
            setCurrentInput(text);
          },
        }}
        provider="mikan"
        model="deepseek-v4-flash"
        mode="agent"
        splashMs={0}
      />
    ),
    { width: 90, height: 16 },
  );
  await setup.renderOnce();

  setup.mockInput.pressArrow("up");
  await setup.renderOnce();
  setup.mockInput.pressArrow("up");
  await setup.renderOnce();
  setup.mockInput.pressArrow("down");
  await setup.renderOnce();

  // Up → newest → next-older → Down → back to newest.
  expect(changes).toEqual(["third message", "second message", "third message"]);
});

test("non-slash Tab still cycles mode", async () => {
  const [messages] = createSignal<TranscriptMessage[]>([]);
  const [status] = createSignal<TuiStatus>("idle");
  const [currentInput] = createSignal("hello");
  const modeCalls: string[] = [];
  const setup = await testRender(
    () => (
      <App
        state={{ messages, status, currentInput }}
        actions={{
          ...baseActions(),
          onModeChange: (mode) => modeCalls.push(mode),
        }}
        provider="mikan"
        model="deepseek-v4-flash"
        mode="agent"
        splashMs={0}
      />
    ),
    { width: 90, height: 16 },
  );
  await setup.renderOnce();

  setup.mockInput.pressKey("TAB");
  await setup.renderOnce();

  expect(modeCalls).toEqual(["agent"]);
});
