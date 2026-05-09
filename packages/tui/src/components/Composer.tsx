/** @jsxImportSource @opentui/solid */
// Bottom-of-screen composer: status line + single-line <input>.
//
// `onInput` from @opentui/solid receives the raw `value: string` (NOT a
// DOM-style event). Same with `onSubmit`. We validate the submitted text
// via `validateSubmit` before forwarding to `actions.onSubmit`.

import { For, Show, createMemo, createSignal } from "solid-js";
import type { JSX } from "@opentui/solid/jsx-runtime";
import type { ToolMode } from "@openseek/tool";
import { defaultTheme } from "../theme.ts";
import { validateSubmit } from "../composer-logic.ts";
import {
  SLASH_COMMANDS,
  getSlashCompletions,
  parseSlashCommand,
  type SlashCommandSpec,
} from "../slash-command.ts";
import type { TuiActions, TuiStatus } from "../types.ts";

/**
 * Custom keyBindings for the composer Input.
 *
 * Two things going on:
 *
 * 1. **Re-include Input's own submit bindings.** InputRenderable's constructor
 *    prepends `{return → submit}` + `{linefeed → submit}` before calling
 *    `super(...)`, but the runtime `set keyBindings(value)` setter
 *    (@opentui/core index-d07rkqtc.js:5401-5405) merges ONLY with
 *    `defaultTextareaKeyBindings` — it does NOT know about Input's prepended
 *    bindings. When Solid pushes `keyBindings={...}` into the renderable AFTER
 *    construction, those Input-level bindings get dropped, `return` reverts
 *    to Textarea's default `newline` action, and because `Input.newLine()`
 *    returns false, Enter becomes a no-op. So we must re-include the submit
 *    bindings in any custom array we pass.
 *
 * 2. **Override `home` / `end` (with and without shift).** Each binding maps
 *    to a synthetic action that Textarea's `_actionHandlers` Map does NOT
 *    know about → handleKeyPress falls through → keys bubble to App's
 *    useKeyboard for transcript scrolling.
 *
 * Exported for the regression test in `tests/composer-keybindings.test.ts`.
 */
export const composerKeyBindings: ReadonlyArray<{
  name: string;
  shift?: boolean;
  action: string;
}> = [
  // Input-level submit bindings (must be re-included; see header comment).
  { name: "return", action: "submit" },
  { name: "linefeed", action: "submit" },
  // Bug 3.4: bubble home/end to App so transcript scroll-to-top/bottom works.
  { name: "home", action: "noop-bubble" },
  { name: "end", action: "noop-bubble" },
  { name: "home", shift: true, action: "noop-bubble" },
  { name: "end", shift: true, action: "noop-bubble" },
  // Bubble plain up/down so App can drive (a) slash-candidate cycling and
  // (b) submit-history recall. Default Textarea bindings map these to
  // `move-up` / `move-down` (multi-line cursor nav) which a single-line
  // Input has nothing to do with — they'd just be silently consumed.
  { name: "up", action: "noop-bubble" },
  { name: "down", action: "noop-bubble" },
];

export interface ComposerProps {
  actions: TuiActions;
  status: () => TuiStatus;
  mode: ToolMode;
  provider: string;
  model: string;
  /** Optional running token total (placeholder until session wires real usage). */
  tokenCount?: () => number;
  /** Optional controlled value. App supplies this so global key handlers can complete slash commands. */
  value?: () => string;
  /** Slash commands visible to autocomplete and parse. */
  slashCommands?: () => ReadonlyArray<SlashCommandSpec>;
  /** Batch-3 D-class: vim modal cursor — feeds the input cursorStyle prop. */
  vimEnabled?: () => boolean;
  vimSubMode?: () => "normal" | "insert";
}

export function Composer(props: ComposerProps): JSX.Element {
  const [value, setValue] = createSignal("");
  const currentValue = (): string => props.value?.() ?? value();
  const commandSpecs = (): ReadonlyArray<SlashCommandSpec> =>
    props.slashCommands?.() ?? SLASH_COMMANDS;
  // Batch-3 D-class: pick a cursor shape based on vim sub-mode.
  //   normal → block (vim convention, signals "type doesn't insert")
  //   insert → line  (vim convention, signals "ready for input")
  // When vim is OFF the helper returns "default" so we don't override
  // opentui's normal cursor behavior.
  const cursorStyleOpts = (): { style: "block" | "line" | "default" } => {
    if (!props.vimEnabled?.()) return { style: "default" };
    return props.vimSubMode?.() === "normal" ? { style: "block" } : { style: "line" };
  };
  const slashCompletions = createMemo(() =>
    getSlashCompletions(currentValue(), commandSpecs()),
  );
  const slashRows = createMemo(() => slashCompletions().candidates.slice(0, 5));
  const composerHeight = (): number => (slashRows().length > 0 ? slashRows().length + 2 : 2);
  const setComposerValue = (next: string): void => {
    if (next === currentValue()) return;
    setValue(next);
    props.actions.onInputChange?.(next);
  };

  const handleSubmit = (raw: string) => {
    // Slash commands skip the LLM submit path entirely — Phase 3.
    const slash = parseSlashCommand(raw, commandSpecs());
    if (slash !== null) {
      props.actions.onSlashCommand?.(slash, raw);
      setComposerValue("");
      return;
    }
    const decision = validateSubmit(raw);
    if (!decision.valid) return;
    props.actions.onSubmit(raw);
    setComposerValue("");
  };

  return (
    // flexShrink:0 + height:2 — without this, a tall transcript (e.g. a long
    // markdown table from the assistant) will squeeze Composer to 0 height
    // because Yoga's column flex shrinks all flexShrink:1 items under
    // pressure. The Composer must always be visible.
    <box flexDirection="column" paddingX={1} flexShrink={0} height={composerHeight()}>
      <Show when={slashRows().length > 0}>
        <box flexDirection="column">
          <For each={slashRows()}>
            {(cmd, index) => {
              // Highlight the row matching the current input value (i.e.
              // the candidate the user has cycled to via Tab / Up / Down).
              // If no row matches (still typing a prefix), highlight row 0
              // so the user knows which one Tab/Down would land on next.
              const isSelected = (): boolean => {
                const cur = currentValue().toLowerCase();
                const exact = slashRows().some(
                  (c) => c.name.toLowerCase() === cur,
                );
                return exact ? cmd.name.toLowerCase() === cur : index() === 0;
              };
              return (
                <box flexDirection="row">
                  <text fg={isSelected() ? defaultTheme.assistant : defaultTheme.system}>
                    {cmd.name}
                  </text>
                  <text fg={defaultTheme.dim}>{`  ${cmd.description}`}</text>
                </box>
              );
            }}
          </For>
        </box>
      </Show>
      <box flexDirection="row">
        <text fg={defaultTheme.dim}>
          {`[${props.mode}] ${props.provider}/${props.model} · ${formatStatus(props.status())}`}
          {props.tokenCount ? ` · ${props.tokenCount()} tok` : ""}
          {slashCompletions().active ? " · Tab complete" : ""}
        </text>
      </box>
      <box flexDirection="row">
        <text fg={defaultTheme.system}>›&nbsp;</text>
        {/* opentui Input emits raw `value: string` for onInput / onSubmit, but
            solid-js's HTML JSX merges DOM SubmitEvent into the intersection.
            Cast the handler to satisfy both shapes — runtime behaviour is
            governed entirely by opentui's reconciler.

            Bug 3.4 fix: opentui's Textarea (Input extends Textarea) maps
            `home`/`end` to `buffer-home`/`buffer-end` actions by default,
            which return TRUE from handleKeyPress and consume the keys —
            App.tsx's `useKeyboard` never sees them, so End/Home can't scroll
            the transcript. We override both bindings to a synthetic action
            name that has no handler in `_actionHandlers`. handleKeyPress
            then falls through, returns false, and the keys bubble up.
            Verified via `_keyBindingsMap` lookup path in
            `node_modules/.bun/@opentui+core@0.2.2/.../index-d07rkqtc.js:5282`. */}
        <input
          value={currentValue()}
          // biome-ignore lint/suspicious/noExplicitAny: opentui Input emits raw value:string; solid-js HTML JSX intersects with SubmitEvent — cast satisfies both.
          onInput={((v: string) => setComposerValue(v)) as any}
          // biome-ignore lint/suspicious/noExplicitAny: see onInput note above.
          onSubmit={((v: string) => handleSubmit(v)) as any}
          // biome-ignore lint/suspicious/noExplicitAny: keyBindings prop is forwarded to TextareaRenderable but the Solid host JSX type doesn't expose it. Action string `noop-bubble` has no _actionHandlers entry → handleKeyPress returns false → key bubbles to App's useKeyboard.
          keyBindings={composerKeyBindings as any}
          // biome-ignore lint/suspicious/noExplicitAny: cursorStyle is on EditBufferRenderable but not in the Solid host JSX type for <input>; opentui forwards it via the renderable setter. See Composer header for the vim sub-mode → cursor shape mapping.
          cursorStyle={cursorStyleOpts() as any}
          focused={true}
          flexGrow={1}
        />
      </box>
    </box>
  );
}

function formatStatus(s: TuiStatus): string {
  switch (s) {
    case "idle":
      return "idle";
    case "streaming":
      return "streaming…";
    case "cancelled":
      return "cancelled";
    case "error":
      return "error";
  }
}
