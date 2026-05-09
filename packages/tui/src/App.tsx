/** @jsxImportSource @opentui/solid */
// Top-level OpenSeek TUI component.
//
// Layout (column):
//   ┌──────────── status bar (1 row) ────────────┐
//   │ transcript (flexGrow:1)                    │
//   └──────────── composer (2 rows) ─────────────┘
//
// Boot sequence:
//   1. Mount Splash for `SPLASH_MS` ms.
//   2. Switch to main UI.
//
// Keyboard:
//   * Ctrl+C #1 → actions.onCancel()
//   * Ctrl+C #2 within 1.5s → actions.onExit()
//   * Ctrl+D twice on empty composer → actions.onExit()
//   * Tab → slash-complete when input starts "/", else mode cycle (G2.5)
//   * Shift+Tab → slash-complete backwards, else effort cycle (G2.6)
//   * PageUp / PageDown   — scroll transcript half-viewport (auto-snap-to-bottom)
//   * Shift+Up / Shift+Down — scroll transcript one line   (auto-snap-to-bottom)
//   * End                  — jump to bottom + re-engage sticky follow
//   * Home                 — jump to top
//
// Scroll handling is delegated to `./scroll-keys.ts` to work around two
// @opentui/core bugs (manual-scroll lock + stale scrollSize race). See that
// file's header for the full story; the short version is "PgDn near bottom
// snaps + re-engages sticky".

import {
  Show,
  createEffect,
  createSignal,
  onCleanup,
  onMount,
  type Accessor,
  type JSX,
} from "solid-js";
import { useKeyboard } from "@opentui/solid";
import type { ScrollBoxRenderable } from "@opentui/core";
import type { ToolMode } from "@openseek/tool";
import type { ConfigSources } from "@openseek/provider";
import { Composer } from "./components/Composer.tsx";
import { Splash } from "./components/Splash.tsx";
import { Transcript } from "./components/Transcript.tsx";
import { createDoubleCtrlCDetector } from "./double-ctrl-c.ts";
import {
  jumpToBottom,
  jumpToTop,
  lineDown,
  lineUp,
  pageDown,
  pageUp,
} from "./scroll-keys.ts";
import { formatSourceTag } from "./format-source.ts";
import { formatTokens } from "./format-tokens.ts";
import { summarizeArgs } from "./format-message.ts";
import {
  getSlashCompletions,
  nextSlashCompletion,
  SLASH_COMMANDS,
  type SlashCompletionSession,
  type SlashCommandSpec,
} from "./slash-command.ts";
import { defaultTheme } from "./theme.ts";
import type {
  ReasoningEffort,
  TuiActions,
  TuiState,
  TuiStatus,
  ToolApprovalState,
  UsageDisplay,
} from "./types.ts";

export interface AppProps {
  state: TuiState;
  actions: TuiActions;
  provider: string;
  model: string;
  mode: ToolMode;
  /** Override splash visible duration (tests pass 0). */
  splashMs?: number;
}

// Default to immediate interactivity. Tests and callers can still opt into a
// splash by passing `splashMs`, but the normal CLI path should never swallow
// early keystrokes behind a decorative screen.
const DEFAULT_SPLASH_MS = 0;

export function App(props: AppProps): JSX.Element {
  const [showSplash, setShowSplash] = createSignal(true);
  const [slashCompletionSession, setSlashCompletionSession] =
    createSignal<SlashCompletionSession>();
  const ctrlCDetector = createDoubleCtrlCDetector();
  const ctrlDDetector = createDoubleCtrlCDetector();
  let scrollBox: ScrollBoxRenderable | undefined;
  const slashCommands = (): ReadonlyArray<SlashCommandSpec> =>
    props.state.slashCommands?.() ?? SLASH_COMMANDS;

  // Submit-history navigation — `historyIndex` is `0` for the most recent
  // entry, `1` for next-older, …, or `-1` when not browsing. `recalledValue`
  // is the buffer we last pushed back into the composer; if currentInput
  // diverges from it the user has started editing, so we exit browse mode.
  const [historyIndex, setHistoryIndex] = createSignal(-1);
  let recalledValue = "";

  createEffect(() => {
    if (props.state.currentInput().length > 0) ctrlDDetector.reset();
  });

  createEffect(() => {
    const current = props.state.currentInput();
    if (historyIndex() !== -1 && current !== recalledValue) {
      // User edited the recalled buffer (or submitted, which clears it) —
      // drop out of history-browse so the next Up starts fresh from newest.
      setHistoryIndex(-1);
      recalledValue = "";
    }
  });

  onMount(() => {
    const ms = props.splashMs ?? DEFAULT_SPLASH_MS;
    if (ms <= 0) {
      setShowSplash(false);
      return;
    }
    const handle = setTimeout(() => setShowSplash(false), ms);
    onCleanup(() => clearTimeout(handle));
  });

  useKeyboard((evt) => {
    if (evt.ctrl && evt.name === "c") {
      const action = ctrlCDetector.press();
      if (action === "cancel") {
        props.actions.onCancel();
      } else {
        // Fire-and-forget — the renderer is being torn down.
        void props.actions.onExit();
      }
      return;
    }
    const pendingApproval = props.state.approval?.();
    if (pendingApproval && !evt.ctrl && !evt.meta) {
      const name = evt.name.toLowerCase();
      if (name === "y") {
        props.actions.onApprovalDecision?.(true);
        return;
      }
      if (name === "n" || name === "escape") {
        props.actions.onApprovalDecision?.(false);
        return;
      }
    }
    // Batch-3 D-class: /vim modal sub-mode toggle. ONLY fires when vim is
    // enabled — when disabled the input behaves exactly as before. We
    // intercept here (not in Composer keyBindings) because opentui's
    // keyBindings prop maps to action names whose handlers must be
    // registered on the renderable; reaching back to a Solid signal from
    // there is awkward. The App-level useKeyboard already runs before the
    // input consumes printable chars (because we early-return), so `i`
    // and `Escape` flip mode without leaking into the buffer.
    const vimOn = props.state.vimEnabled?.() ?? false;
    if (vimOn && !evt.ctrl && !evt.meta) {
      const sub = props.state.vimSubMode?.() ?? "insert";
      if (sub === "insert" && evt.name === "escape") {
        props.actions.onVimSubModeChange?.("normal");
        return;
      }
      if (sub === "normal" && (evt.name === "i" || evt.name === "a")) {
        props.actions.onVimSubModeChange?.("insert");
        return;
      }
    }
    if (evt.ctrl && evt.name === "d") {
      // Double Ctrl+D exits when composer is empty. Single-press exit is too
      // easy to trigger while an IME preedit string is visually present but
      // not yet committed into the Input value.
      if (props.state.currentInput().length === 0) {
        const action = ctrlDDetector.press();
        if (action === "exit") void props.actions.onExit();
      } else {
        ctrlDDetector.reset();
      }
      return;
    }
    // Up / Down — slash-candidate cycling when a slash menu is active,
    // otherwise submit-history recall when the composer is empty (or
    // currently showing a recalled value the user hasn't edited).
    // Shift+Up / Shift+Down are reserved for transcript scrolling and
    // handled below.
    if ((evt.name === "up" || evt.name === "down") && !evt.ctrl && !evt.meta && !evt.shift) {
      const input = props.state.currentInput();
      const direction = evt.name === "up" ? -1 : 1;
      const slashState = getSlashCompletions(input, slashCommands());
      const previous = slashCompletionSession();
      if (slashState.active || previous?.value === input) {
        const completion = nextSlashCompletion(input, previous, direction, slashCommands());
        if (completion) {
          setSlashCompletionSession(completion.session);
          props.actions.onInputChange?.(completion.value);
        }
        return;
      }
      const history = props.state.submitHistory?.() ?? [];
      if (history.length === 0) return;
      const setRecalled = (value: string, idx: number): void => {
        // Order matters: push the buffer FIRST, then bump the index.
        // Solid runs the createEffect-based "user-edit" detector
        // synchronously after each signal write — if we flip historyIndex
        // before the currentInput update lands, the effect sees
        // (idx !== -1, current !== recalledValue) and resets browse mode
        // before we even finish recalling.
        recalledValue = value;
        props.actions.onInputChange?.(value);
        setHistoryIndex(idx);
      };
      const idx = historyIndex();
      if (evt.name === "up") {
        if (idx === -1) {
          // Only start browsing from an empty composer — otherwise Up
          // would clobber whatever the user was already typing.
          if (input.length > 0) return;
          const value = history[history.length - 1];
          if (value !== undefined) setRecalled(value, 0);
          return;
        }
        if (idx + 1 < history.length) {
          const value = history[history.length - 1 - (idx + 1)];
          if (value !== undefined) setRecalled(value, idx + 1);
        }
        return;
      }
      // Down
      if (idx === -1) return;
      if (idx === 0) {
        recalledValue = "";
        props.actions.onInputChange?.("");
        setHistoryIndex(-1);
        return;
      }
      const value = history[history.length - 1 - (idx - 1)];
      if (value !== undefined) setRecalled(value, idx - 1);
      return;
    }
    if (evt.name === "tab" && !evt.ctrl && !evt.meta) {
      const input = props.state.currentInput();
      const slashState = getSlashCompletions(input, slashCommands());
      const previous = slashCompletionSession();
      if (slashState.active || previous?.value === input) {
        const completion = nextSlashCompletion(
          input,
          previous,
          evt.shift ? -1 : 1,
          slashCommands(),
        );
        if (completion) {
          setSlashCompletionSession(completion.session);
          props.actions.onInputChange?.(completion.value);
        } else {
          setSlashCompletionSession(undefined);
        }
        return;
      }
      setSlashCompletionSession(undefined);
      // Shift+Tab → reasoning effort cycle; Tab alone → mode cycle.
      // The CLI owns the actual cycling logic; we just signal "advance".
      const handlers = props.actions;
      if (evt.shift) {
        handlers.onEffortChange?.(currentEffort(props.state));
      } else {
        handlers.onModeChange?.(currentMode(props.state, props.mode));
      }
      return;
    }
    if (scrollBox) {
      // pageup/pagedown bubble past the focused composer Input (Textarea
      // discards non-printable/escape sequences), so we receive them here.
      // Scroll keys go through scroll-keys.ts so PgDn / Shift+Down can
      // re-engage sticky-follow when the user lands near the (fresh) bottom.
      if (evt.name === "pageup") {
        pageUp(scrollBox);
        return;
      }
      if (evt.name === "pagedown") {
        pageDown(scrollBox);
        return;
      }
      if (evt.shift && evt.name === "up") {
        lineUp(scrollBox);
        return;
      }
      if (evt.shift && evt.name === "down") {
        lineDown(scrollBox);
        return;
      }
      if (evt.name === "end") {
        jumpToBottom(scrollBox);
        return;
      }
      if (evt.name === "home") {
        jumpToTop(scrollBox);
        return;
      }
    }
  });

  const setScrollRef = (el: ScrollBoxRenderable) => {
    scrollBox = el;
  };

  return (
    <box flexDirection="column" flexGrow={1}>
      <Show
        when={showSplash()}
        fallback={<MainLayout {...props} scrollRef={setScrollRef} />}
      >
        <Splash provider={props.provider} model={props.model} />
      </Show>
    </box>
  );
}

function currentMode(state: TuiState, fallback: ToolMode): ToolMode {
  return state.mode ? state.mode() : fallback;
}

function currentEffort(state: TuiState): ReasoningEffort {
  return state.effort ? state.effort() : "off";
}

interface MainLayoutProps extends AppProps {
  scrollRef: (el: ScrollBoxRenderable) => void;
}

function MainLayout(props: MainLayoutProps): JSX.Element {
  const liveMode = (): ToolMode => currentMode(props.state, props.mode);
  return (
    <box flexDirection="column" flexGrow={1}>
      <StatusBar
        provider={props.provider}
        model={props.model}
        mode={liveMode}
        effort={() => currentEffort(props.state)}
        usage={() => props.state.usage?.()}
        walletBalance={() => props.state.walletBalance?.() ?? null}
        costUsd={() => props.state.costUsd?.() ?? 0}
        configSource={() => props.state.configSource?.()}
        status={props.state.status}
      />
      <Transcript messages={props.state.messages} scrollRef={props.scrollRef} />
      <Show when={props.state.approval?.() ?? null}>
        {(approval: Accessor<ToolApprovalState>) => (
          <ApprovalBar
            toolName={approval().toolName}
            args={approval().args}
          />
        )}
      </Show>
      <Composer
        actions={props.actions}
        status={props.state.status}
        mode={liveMode()}
        provider={props.provider}
        model={props.model}
        value={props.state.currentInput}
        slashCommands={props.state.slashCommands}
        vimEnabled={props.state.vimEnabled}
        vimSubMode={props.state.vimSubMode}
      />
    </box>
  );
}

interface ApprovalBarProps {
  toolName: string;
  args: unknown;
}

function ApprovalBar(props: ApprovalBarProps): JSX.Element {
  return (
    <box flexDirection="column" paddingX={1} flexShrink={0} height={2}>
      <box flexDirection="row">
        <text fg={defaultTheme.error}>Approve tool </text>
        <text fg={defaultTheme.tool}>{props.toolName}</text>
        <text fg={defaultTheme.dim}>{`(${summarizeArgs(props.args)})`}</text>
      </box>
      <box flexDirection="row">
        <text fg={defaultTheme.dim}>Press </text>
        <text fg={defaultTheme.assistant}>y</text>
        <text fg={defaultTheme.dim}> to allow, </text>
        <text fg={defaultTheme.error}>n</text>
        <text fg={defaultTheme.dim}> or Esc to deny</text>
      </box>
    </box>
  );
}

interface StatusBarProps {
  provider: string;
  model: string;
  mode: () => ToolMode;
  effort: () => ReasoningEffort;
  usage: () => UsageDisplay | undefined;
  walletBalance: () => number | null;
  costUsd: () => number;
  configSource: () => ConfigSources | undefined;
  status: () => TuiStatus;
}

function StatusBar(props: StatusBarProps): JSX.Element {
  const sourceTag = (): string => {
    const cs = props.configSource();
    return cs ? formatSourceTag(cs) : "";
  };
  // flexShrink:0 + height:1 — same reason as Composer: must not be squeezed
  // when the transcript renders very tall content (markdown table, long
  // code block, etc.).
  return (
    <box flexDirection="row" paddingX={1} flexShrink={0} height={1}>
      <text fg={defaultTheme.splash}>OpenSeek </text>
      <text fg={modeColor(props.mode())}>{`[${props.mode()}]`}</text>
      <text fg={defaultTheme.dim}>
        {` · ${props.provider}/${props.model}${sourceTag()} · effort:${props.effort()}${formatUsage(
          props.usage(),
        )}${formatWalletCost(props.walletBalance(), props.costUsd())} · ${props.status()}`}
      </text>
    </box>
  );
}

export function formatWalletCost(balance: number | null, costUsd: number): string {
  const w = balance !== null ? `wallet:$${balance.toFixed(2)}` : "wallet:?";
  const c = `cost:$${costUsd.toFixed(4)}`;
  return ` · ${w} · ${c}`;
}

function modeColor(mode: ToolMode): string {
  if (mode === "plan") return "#facc15"; // yellow-400
  if (mode === "yolo") return "#f87171"; // red-400
  return defaultTheme.assistant;
}

export function formatUsage(usage: UsageDisplay | undefined): string {
  if (!usage) return "";
  const cacheCreate = formatTokens(usage.cacheCreation ?? 0);
  const cacheRead = formatTokens(usage.cacheRead ?? 0);
  const inn = formatTokens(usage.totalIn);
  const out = formatTokens(usage.totalOut);
  return ` · cache:${cacheCreate}/${cacheRead} in:${inn} out:${out}`;
}
