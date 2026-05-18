// Interactive runtime — owns reactive state and wires session events to TUI.

import { createSignal } from "solid-js";
import {
  defaultRegistry as defaultCommandRegistry,
  type Command,
  type CommandContext,
  type CommandResult,
} from "@openseek/command";
import {
  defaultRegistry as defaultToolRegistry,
  setAgentSpawnDeps,
  type ToolMode,
} from "@openseek/tool";
import type { ConfigSources, LLMProvider, OpenSeekMessage, WalletInfo } from "@openseek/provider";
import {
  compactNow,
  runSession,
  type ReasoningEffort,
  type SessionState,
  type ToolApprovalRequest,
} from "@openseek/session";
import {
  applyOutputStyle,
  mountTui,
  setCurrentTheme,
  type OutputStyle,
  type TranscriptMessage,
  type ToolApprovalState,
  type SlashCommandSpec,
  type TuiActions,
  type TuiStatus,
  type UsageDisplay,
} from "@openseek/tui";

import { addCost, type CostState } from "./boot.ts";
import { runBootSideEffects } from "./boot-side-effects.ts";
import { cycleEffort, cycleMode } from "./cycle.ts";
import { attachProcessSignals, createInflightTracker, waitForInflight } from "./lifecycle.ts";
import { mergeAssistant, mergeUsage } from "./merge.ts";
import { dispatchSlash } from "./runtime-switch.ts";
import { createRouting, userMessage, userRow } from "./wire.ts";
import { missingApiKeyMessage, providerRequiresApiKey } from "./provider-auth.ts";
import {
  applyColorMode,
  appendDebugLogLine,
  installSkillFromSpec,
  type ColorMode,
  type DebugLogEntry,
} from "./slash-effects.ts";

export interface InteractiveOpts {
  provider: LLMProvider;
  modelId: string;
  apiKey: string;
  baseURL?: string;
  /** Per-field config sources for the status-bar tag. Optional. */
  configSource?: ConfigSources;
  /** F1.5: true when the wizard ACTUALLY changed apiKey vs. echoed it back —
   *  CLI loop uses this to decide whether to persist the key to disk. */
  apiKeyChanged?: boolean;
}

export interface InteractiveResult {
  exitCode: number;
  /**
   * When set, the caller should tear nothing down and instead invoke
   * `runInteractive(switchTo)` again — the user just ran `/model` or
   * `/provider`. The previous renderer is already destroyed.
   */
  switchTo?: InteractiveOpts;
}

export async function runInteractive(opts: InteractiveOpts): Promise<InteractiveResult> {
  const [messages, setMessages] = createSignal<TranscriptMessage[]>([]);
  const [status, setStatus] = createSignal<TuiStatus>("idle");
  const [draft, setDraft] = createSignal("");
  const [mode, setMode] = createSignal<ToolMode>("agent");
  const [effort, setEffort] = createSignal<ReasoningEffort>("off");
  const [usage, setUsage] = createSignal<UsageDisplay | undefined>(undefined);
  const [outputStyle, setOutputStyle] = createSignal<OutputStyle>("default");
  const [walletBalance, setWalletBalance] = createSignal<WalletInfo | null>(null);
  const [cost, setCost] = createSignal<CostState>({ totalUsd: 0 });
  const [configSource] = createSignal<ConfigSources | undefined>(opts.configSource);
  const [approval, setApproval] = createSignal<ToolApprovalState | null>(null);
  // Batch-3 D-class wiring — /vim modal cursor.
  // Two signals, not one: `vimEnabled` is the master toggle, `vimSubMode`
  // is the sub-state (normal vs insert). Composer reads both to pick the
  // cursor style + the App.tsx useKeyboard handler reads them to gate the
  // i / Esc keypresses that switch sub-mode.
  const [vimEnabled, setVimEnabled] = createSignal<boolean>(false);
  const [vimSubMode, setVimSubMode] = createSignal<"normal" | "insert">("insert");
  // In-memory submit history for the composer's Up/Down recall. Capped so
  // a long-running session doesn't grow without bound. Consecutive duplicate
  // submissions collapse, mirroring readline's `HISTCONTROL=ignoredups`.
  const SUBMIT_HISTORY_CAP = 200;
  const [submitHistory, setSubmitHistory] = createSignal<readonly string[]>([]);
  const pushSubmitHistory = (text: string): void => {
    const trimmed = text.trim();
    if (trimmed.length === 0) return;
    setSubmitHistory((prev) => {
      const last = prev[prev.length - 1];
      if (last === text) return prev;
      const next = [...prev, text];
      if (next.length > SUBMIT_HISTORY_CAP) next.splice(0, next.length - SUBMIT_HISTORY_CAP);
      return next;
    });
  };

  let abortCtl: AbortController | null = null;
  // The renderer field is needed for OSC52 clipboard write (/copy).
  let mountHandle: Awaited<ReturnType<typeof mountTui>> | undefined;
  let resolveResult: ((r: InteractiveResult) => void) | undefined;
  let mountDestroyed = false;
  let localRowSeq = 0;
  const appendSystemRow = (text: string): void => {
    localRowSeq += 1;
    setMessages((prev) => [
      ...prev,
      { id: `cli-${Date.now()}-${localRowSeq}`, kind: "system", text },
    ]);
  };
  // Bug 3.3 fix: tracks the in-flight stream promise so dispatchSlash can
  // await it before tearing down the renderer + spinning up the wizard.
  // F5 P0-GAP #3: identity-tracker — resubmits during pending unwind no
  // longer clobber the live promise reference.
  const inflight = createInflightTracker();

  // G6.2/G6.3/G6.5/G6.6: wallet probe + sync + locale detection.
  // This must be non-blocking: a slow gateway should not delay the initial
  // renderer mount or make the composer appear deaf at startup.
  void runBootSideEffects({
    bootOpts: {
      apiKey: opts.apiKey,
      baseURL: opts.baseURL,
      providerId: opts.provider.id,
    },
    isDisposed: () => mountDestroyed,
    setWalletBalance,
    appendMessages: (rows) => setMessages((prev) => [...prev, ...rows]),
  });
  // walletBalance + cost feed status bar via TuiState below (post-v1.0 #2).

  const tools = defaultToolRegistry();
  const commands = defaultCommandRegistry();
  // commandState is the long-lived bag of read-only state slash commands
  // see via `ctx.state`. Each command also mutates it (e.g. /add-dir
  // pushes to allowedDirs, /debug toggles a flag), so the object lives
  // for the whole runInteractive lifetime — short-lived per-call objects
  // would lose those mutations between commands.
  //
  // `stats` is kept here (not in a local) so /stats can read it without
  // a dedicated wiring pass; the loop below increments it as each
  // SessionEvent flows through. Pre-fix /stats always showed 0/0/0
  // because nothing populated `ctx.state.stats`.
  const commandStats = { turns: 0, toolCalls: 0, errors: 0 };
  const commandState: Record<string, unknown> = { stats: commandStats };
  // T2/T3/T4 ctx hooks — see slash-effects.ts for impl + tests.
  const setColorMode = (mode: ColorMode): void => applyColorMode(mode);
  const debugEnabled = (): boolean => commandState.debug === true;
  const appendDebugLog = (entry: DebugLogEntry): void => appendDebugLogLine(entry, debugEnabled);
  const installSkill = async (spec: string): Promise<void> =>
    installSkillFromSpec(spec, {
      cwd: process.cwd(),
      spawn: spawnCommand,
      appendRow: (text) => appendSystemRow(text),
    });
  // Post-v1.0 D-class: /compact runs a one-shot compaction over the live
  // wireMessages buffer. We MUTATE wireMessages in place so the next
  // onSubmit sees the collapsed history; transcript signal is not touched
  // (the user keeps the visual log + sees a single system row reporting
  // the diff). On no-op (≤2 messages or strategy decided nothing dropped),
  // we still surface a row so the user knows the command was received.
  const triggerCompact = async (): Promise<void> => {
    const before = wireMessages.length;
    if (before === 0) {
      appendSystemRow("compact: nothing to compact yet — wire history is empty");
      return;
    }
    const result = await compactNow(wireMessages, { strategy: "session-memory" });
    wireMessages.length = 0;
    for (const m of result.messages) wireMessages.push(m);
    const after = wireMessages.length;
    appendSystemRow(`compacted ${before} → ${after} messages (strategy: ${result.strategy})`);
  };
  const commandSpecs = buildSlashCommandSpecs(commands.list());
  const [slashCommands] = createSignal<ReadonlyArray<SlashCommandSpec>>(commandSpecs);
  const cap = opts.provider.capability(opts.modelId);
  setAgentSpawnDeps({
    provider: opts.provider,
    model: opts.modelId,
    tools: tools.toMap(),
    capability: cap,
    apiKey: opts.apiKey,
    baseURL: opts.baseURL,
    cwd: process.cwd(),
  });
  const wireMessages: OpenSeekMessage[] = [];

  const routing = createRouting({
    appendRow(row) {
      setMessages((prev) => [...prev, row]);
    },
    updateLastAssistantText(append) {
      setMessages((prev) => mergeAssistant(prev, "assistant-text", append));
    },
    updateLastAssistantThinking(append) {
      setMessages((prev) => mergeAssistant(prev, "assistant-thinking", append));
    },
    setStatus,
    setUsage(snap) {
      setUsage((prev) => mergeUsage(prev, snap));
      // G6.4: fold per-turn USD cost into the running cost state.
      setCost((prev) => addCost(prev, snap, opts.modelId));
    },
    // F2 fix (Bug 2.1): fold the just-completed assistant turn into the
    // wire history so the next user submit carries assistant context. Also
    // covers the cancel path — partial-but-coherent turns are preserved.
    appendHistory(turnMessages) {
      for (const m of turnMessages) wireMessages.push(m);
    },
  });

  interface ApprovalQueueItem {
    req: ToolApprovalRequest;
    signal?: AbortSignal;
    onAbort?: () => void;
    resolve: (approved: boolean) => void;
  }

  const approvalQueue: ApprovalQueueItem[] = [];
  let activeApproval: ApprovalQueueItem | undefined;

  const showNextApproval = (): void => {
    if (activeApproval || approvalQueue.length === 0) return;
    activeApproval = approvalQueue.shift();
    const req = activeApproval?.req;
    if (!req) return;
    setApproval({
      id: req.id,
      toolName: req.name,
      args: req.input,
      permission: req.permission,
    });
  };

  const settleApproval = (item: ApprovalQueueItem, approved: boolean): void => {
    item.signal?.removeEventListener("abort", item.onAbort ?? (() => {}));
    const queuedIndex = approvalQueue.indexOf(item);
    if (queuedIndex >= 0) approvalQueue.splice(queuedIndex, 1);
    if (activeApproval === item) {
      activeApproval = undefined;
      setApproval(null);
    }
    appendSystemRow(`${approved ? "approved" : "denied"} tool: ${item.req.name}`);
    item.resolve(approved);
    showNextApproval();
  };

  const finishApproval = (approved: boolean): void => {
    if (!activeApproval) return;
    settleApproval(activeApproval, approved);
  };
  const requestToolApproval = (req: ToolApprovalRequest): Promise<boolean> => {
    const signal = abortCtl?.signal;
    if (signal?.aborted) return Promise.resolve(false);
    return new Promise<boolean>((resolve) => {
      const item: ApprovalQueueItem = { req, signal, resolve };
      item.onAbort = () => settleApproval(item, false);
      signal?.addEventListener("abort", item.onAbort, { once: true });
      approvalQueue.push(item);
      showNextApproval();
    });
  };
  const runSlashCommand = async (
    name: string,
    args: string[],
  ): Promise<CommandResult | null> => {
    const resolvedName = name === "quit" ? "exit" : name;
    const cmd = commands.get(resolvedName);
    if (!cmd) return null;
    commandState.currentProvider = opts.provider.id;
    commandState.allCommands = commands
      .list()
      .map((c) => ({ name: c.name, description: c.description, category: c.category }));
    if (usage()) commandState.usage = usage();
    const session: NonNullable<CommandContext["session"]> = {
      messages: wireMessages,
      model: opts.modelId,
      effort: effortToCommand(effort()),
      mode: mode(),
      outputStyle: outputStyle(),
    };
    return await cmd.handle({
      cwd: process.cwd(),
      args,
      state: commandState,
      session,
      spawn: spawnCommand,
    });
  };

  const actions: TuiActions = {
    onSubmit(text) {
      if (inflight.current()) {
        appendSystemRow(
          "current turn is still running — press Ctrl+C to cancel before submitting again",
        );
        return;
      }
      if (providerRequiresApiKey(opts.provider) && !opts.apiKey) {
        setMessages((prev) => [
          ...prev,
          {
            id: `e${Date.now()}`,
            kind: "error",
            text: missingApiKeyMessage(opts.provider),
          },
        ]);
        return;
      }
      setMessages((prev) => [...prev, userRow(text)]);
      wireMessages.push(userMessage(text));
      pushSubmitHistory(text);
      setStatus("streaming");

      abortCtl = new AbortController();
      const ctl = abortCtl;
      // Bug 3.2 / critic-loop fix: each accepted submit gets a fresh epoch.
      // This prevents a late event from a prior iterator from sharing the
      // next turn's routing token and corrupting transcript/history.
      const turnEpoch = routing.bumpEpoch();
      const styled = applyOutputStyle(wireMessages, outputStyle());
      // T1: /break-cache toggled `commandState.breakCache=true` and we
      // consume it here exactly once — strip it before runSession so a
      // subsequent submit (without re-running /break-cache) reverts to
      // normal cached behavior. The session runner reads `state.breakCache`
      // and strips any cache_control breakpoints from the outbound payload.
      const breakCache = commandState.breakCache === true;
      if (breakCache) commandState.breakCache = false;
      // Post-v1.0 D-class /fast: when commandState.fastMode is ON and the
      // current model has a `fastVariant`, swap to the variant for THIS
      // turn only. Status bar + transcript label keep showing the nominal
      // model — the swap is invisible to the user except via cost. We do
      // NOT clear fastMode: it stays ON across turns until the user
      // toggles it again (matches the handler's idempotent toggle).
      const fastModeOn = commandState.fastMode === true;
      const effectiveModel =
        fastModeOn && cap.fastVariant ? cap.fastVariant : opts.modelId;
      // capability for the effective model. When swapping (anthropic /
      // mikan have per-model caps) this picks up the variant's tighter
      // context window; for openai-compat factories it's identical.
      const effectiveCap =
        effectiveModel === opts.modelId ? cap : opts.provider.capability(effectiveModel);
      const state: SessionState = {
        messages: styled,
        mode: mode(),
        reasoningEffort: effort(),
        model: effectiveModel,
        provider: opts.provider.id,
        breakCache,
      };

      // F5 P0-GAP #3: identity-tracking inflight slot — see lifecycle.ts.
      inflight.track(
        (async () => {
          for await (const evt of runSession(state, {
            provider: opts.provider,
            model: effectiveModel,
            tools: tools.toMap(),
            capability: effectiveCap,
            apiKey: opts.apiKey,
            baseURL: opts.baseURL,
            signal: ctl.signal,
            reasoningEffort: effort(),
            approveToolCall: requestToolApproval,
          })) {
            // Counter wiring for /stats. We tap the same event stream
            // routing.apply consumes — single source of truth, no
            // duplicate event listener path to keep in sync.
            if (evt.type === "tool-call") commandStats.toolCalls += 1;
            else if (evt.type === "error") commandStats.errors += 1;
            else if (evt.type === "turn-end") commandStats.turns += 1;
            // T3 /debug — append routing events (skipping high-rate
            // text-delta / thinking-delta) when the user has toggled
            // debug ON. No-op when disabled (cheap predicate).
            if (debugEnabled() && evt.type !== "text-delta" && evt.type !== "thinking-delta") {
              appendDebugLog({ ts: new Date().toISOString(), type: evt.type });
            }
            routing.apply(evt, turnEpoch);
          }
        })(),
      );
    },
    onCancel() {
      abortCtl?.abort();
    },
    async onExit() {
      abortCtl?.abort();
      // Bug 3.3 fix: drain the in-flight iterator before destroying the
      // mount, with a 2s safety timeout in case the abort doesn't propagate.
      await waitForInflight(() => inflight.current(), 2000);
      await mountHandle?.destroy();
      mountDestroyed = true;
      resolveResult?.({ exitCode: 0 });
    },
    onModeChange() {
      setMode((m) => cycleMode(m));
    },
    onEffortChange() {
      setEffort((e) => cycleEffort(e));
    },
    onSlashCommand(cmd, raw) {
      // Composer passes the exact submitted buffer before clearing it, so
      // history recall covers both `/foo` and free-text submits identically
      // without relying on controlled-input signal timing.
      pushSubmitHistory(raw);
      void dispatchSlash(
        {
          current: opts,
          abortInflight: () => abortCtl?.abort(),
          // Bug 3.2 fix: bump epoch BEFORE clearing/aborting so any events
          // from the doomed iterator are dropped by routing.apply. Order
          // matters: epoch first → abort → clearMessages.
          bumpEpoch: () => routing.bumpEpoch(),
          // Bug 3.3 fix: hand dispatchSlash a settle-await for the in-flight
          // stream so it can drain BEFORE destroying the mount + spinning a
          // wizard renderer. 2s ceiling guards against pathological providers.
          awaitInflight: () => waitForInflight(() => inflight.current(), 2000),
          destroyMount: async () => {
            await mountHandle?.destroy();
            mountDestroyed = true;
          },
          appendRow: (row) => setMessages((prev) => [...prev, row]),
          clearMessages: () => {
            setMessages([]);
            wireMessages.length = 0;
            setStatus("idle");
          },
          resolveResult: (r) => resolveResult?.(r),
          slashCommands: commandSpecs,
          runCommand: runSlashCommand,
          setMode,
          setEffort,
          setOutputStyle: (style) => {
            if (isOutputStyle(style)) setOutputStyle(style);
          },
          // /copy needs the last RENDERED assistant turn, not the last
          // wire message — wire history may include tool turns whose text
          // is not what the user wanted to copy. Walk the transcript
          // signal backwards for the last `assistant-text` row.
          lastAssistantText: () => {
            const rows = messages();
            for (let i = rows.length - 1; i >= 0; i--) {
              const r = rows[i];
              if (r && r.kind === "assistant-text") return r.text;
            }
            return null;
          },
          // OSC52 round-trips the clipboard text through the terminal,
          // so it works over SSH and tmux (with set-clipboard on).
          // Returns false if the terminal advertises no OSC52 support;
          // applyCommandResult surfaces that to the user.
          copyToClipboard: (textToCopy) =>
            mountHandle?.renderer.copyToClipboardOSC52(textToCopy) ?? false,
          // T2: /color env switch — flips the *_COLOR env vars so child
          // processes (and any later spawned writers) inherit the chosen
          // mode. The TUI itself runs through opentui, which doesn't
          // re-read these env vars mid-process; downstream tools (git
          // diff, ripgrep) and re-spawned subagents will see the change.
          setColorMode,
          // T3: /debug — append routing events to ~/.openseek/debug.log.
          appendDebugLog,
          // T4: /skills install — git clone <spec> into .openseek/skills/.
          installSkill,
          // Post-v1.0 D-class: /compact — collapse wireMessages via
          // sessionMemoryCompact. See triggerCompact closure above.
          triggerCompact,
          // Batch-3: /theme — flip the live theme by mutating the
          // signal in @openseek/tui. The Proxy-backed defaultTheme reads
          // from this signal on every JSX-attribute access so all
          // <text fg={...}> bindings re-render with the new colors.
          setTheme: (name) => setCurrentTheme(name),
          // Batch-3: /vim — flip vimEnabled and reset sub-mode to
          // "insert" so the user can keep typing immediately when
          // turning vim ON.
          setVim: (on) => {
            setVimEnabled(on);
            if (on) setVimSubMode("insert");
          },
        },
        cmd,
      ).catch((err) => {
        const message = err instanceof Error ? err.message : String(err);
        if (mountDestroyed) {
          resolveResult?.({ exitCode: 1 });
          return;
        }
        appendSystemRow(`slash command failed: ${message}`);
        setStatus("error");
      });
    },
    onInputChange(text) {
      setDraft(text);
    },
    onApprovalDecision(approved) {
      finishApproval(approved);
    },
    onVimSubModeChange(next) {
      // Gate inside the action — the App-side handler already checks
      // vimEnabled, but a defensive double-check here means a stray
      // event from a future caller can't flip sub-mode while vim is OFF.
      if (vimEnabled()) setVimSubMode(next);
    },
  };

  mountHandle = await mountTui({
    state: {
      messages,
      status,
      currentInput: draft,
      mode,
      effort,
      usage,
      walletBalance: () => walletBalance()?.balanceUsd ?? null,
      costUsd: () => cost().totalUsd,
      configSource,
      approval,
      slashCommands,
      submitHistory,
      vimEnabled,
      vimSubMode,
    },
    actions,
    provider: opts.provider.id,
    model: opts.modelId,
    mode: mode(),
  });

  // Bug 3.1 fix: register process-level signal hooks ONCE per process via
  // attachProcessSignals — pre-fix, this `process.on(...)` pair fired on
  // every runInteractive call and never unwound, leaking 2 listeners per
  // /model or /provider switch. The new path swaps a single resolver slot.
  const setSignalResolver = attachProcessSignals();

  return new Promise<InteractiveResult>((resolve) => {
    let settled = false;
    const settle = (r: InteractiveResult): void => {
      if (settled) return;
      settled = true;
      // Detach our resolver from the singleton slot before settling so a
      // later signal can't fire into this already-resolved promise.
      setSignalResolver(undefined);
      resolve(r);
    };
    resolveResult = settle;
    setSignalResolver(() => settle({ exitCode: 0 }));
  });
}

// Re-export for back-compat with prior consumers that imported these from
// `./interactive.ts`. The implementations live in `./merge.ts` so this file
// stays under the 250-LOC budget (post-F3 refactor).
export { mergeAssistant, mergeUsage } from "./merge.ts";

function buildSlashCommandSpecs(commands: Command[]): SlashCommandSpec[] {
  const extras: SlashCommandSpec[] = [
    { name: "/provider", description: "Switch provider (and re-pick model)" },
    { name: "/quit", description: "Alias for /exit" },
  ];
  return [...commands.map((cmd) => ({ name: `/${cmd.name}`, description: cmd.description })), ...extras]
    .sort((a, b) => a.name.localeCompare(b.name));
}

function effortToCommand(effort: ReasoningEffort): NonNullable<CommandContext["session"]>["effort"] {
  if (effort === "off") return "low";
  if (effort === "high") return "medium";
  return "high";
}

function isOutputStyle(style: string): style is OutputStyle {
  return ["default", "concise", "verbose", "pirate", "sarcastic"].includes(style);
}

async function spawnCommand(
  cmd: string[],
  opts?: { cwd?: string },
): Promise<{ stdout: string; stderr: string; exitCode: number }> {
  const proc = Bun.spawn(cmd, {
    cwd: opts?.cwd ?? process.cwd(),
    stdout: "pipe",
    stderr: "pipe",
  });
  const [stdout, stderr, exitCode] = await Promise.all([
    new Response(proc.stdout).text(),
    new Response(proc.stderr).text(),
    proc.exited,
  ]);
  return { stdout, stderr, exitCode };
}
