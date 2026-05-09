// TUI-layer types for OpenSeek (G1.2 + G1.4).
//
// We map the session-layer `OpenSeekMessage` (a structured wire-format
// representation of the conversation) into a flat list of `TranscriptMessage`
// rows that the TUI renders one at a time. A single OpenSeekMessage may split
// into multiple TranscriptMessage rows — e.g. an assistant turn carrying a
// thinking block + a tool_call + a final answer becomes 3 rows so each gets
// its own colour/layout treatment.

import type { Accessor } from "solid-js";
import type { ToolMode, ToolPermission } from "@openseek/tool";
import type { ConfigSources } from "@openseek/provider";
import type { SlashCommand, SlashCommandSpec } from "./slash-command.ts";

/** Re-exported from session — kept here so TUI consumers don't reach across. */
export type ReasoningEffort = "off" | "high" | "max";

/** Cumulative usage shape — mirrors session's UsageSnapshot. */
export interface UsageDisplay {
  totalIn: number;
  totalOut: number;
  cacheCreation?: number;
  cacheRead?: number;
}

// ---------- transcript rows ----------

/** Discriminator for `TranscriptMessage`. */
export type TranscriptKind =
  | "user"
  | "assistant-text"
  | "assistant-thinking"
  | "tool-call"
  | "tool-result"
  | "system"
  | "error"
  | "cancelled";

interface TranscriptBase {
  /** Stable id used as For-loop key. */
  id: string;
}

export type TranscriptMessage =
  | (TranscriptBase & { kind: "user"; text: string })
  | (TranscriptBase & { kind: "assistant-text"; text: string })
  | (TranscriptBase & { kind: "assistant-thinking"; text: string })
  | (TranscriptBase & {
      kind: "tool-call";
      toolName: string;
      args: unknown;
      toolCallId: string;
    })
  | (TranscriptBase & {
      kind: "tool-result";
      toolName?: string;
      result: unknown;
      isError?: boolean;
      toolCallId: string;
    })
  | (TranscriptBase & { kind: "system"; text: string })
  | (TranscriptBase & { kind: "error"; text: string })
  | (TranscriptBase & { kind: "cancelled"; text?: string });

// ---------- type guards ----------

export const isUser = (m: TranscriptMessage): m is Extract<TranscriptMessage, { kind: "user" }> =>
  m.kind === "user";

export const isAssistantText = (
  m: TranscriptMessage,
): m is Extract<TranscriptMessage, { kind: "assistant-text" }> => m.kind === "assistant-text";

export const isAssistantThinking = (
  m: TranscriptMessage,
): m is Extract<TranscriptMessage, { kind: "assistant-thinking" }> =>
  m.kind === "assistant-thinking";

export const isToolCall = (
  m: TranscriptMessage,
): m is Extract<TranscriptMessage, { kind: "tool-call" }> => m.kind === "tool-call";

export const isToolResult = (
  m: TranscriptMessage,
): m is Extract<TranscriptMessage, { kind: "tool-result" }> => m.kind === "tool-result";

export const isError = (m: TranscriptMessage): m is Extract<TranscriptMessage, { kind: "error" }> =>
  m.kind === "error";

export const isCancelled = (
  m: TranscriptMessage,
): m is Extract<TranscriptMessage, { kind: "cancelled" }> => m.kind === "cancelled";

// ---------- theme ----------

export interface TuiTheme {
  /** Foreground colour for user prompt rows. */
  user: string;
  /** Foreground colour for assistant final-answer rows. */
  assistant: string;
  /** Foreground colour for thinking-block rows (G1.4 — gray + italic). */
  thinking: string;
  /** Foreground colour for tool-call / tool-result rows. */
  tool: string;
  /** Foreground colour for error rows. */
  error: string;
  /** Foreground colour for system / status rows. */
  system: string;
  /** Dim / secondary text colour (used for tool args, status bar). */
  dim: string;
  /** Foreground colour for the splash banner accent. */
  splash: string;
}

// ---------- runtime status ----------

export type TuiStatus = "idle" | "streaming" | "cancelled" | "error";

export interface ToolApprovalState {
  id: string;
  toolName: string;
  args: unknown;
  permission: ToolPermission;
}

// ---------- bindings exposed to <App> ----------

/** Reactive state surface. Caller (cli) owns the signals. */
export interface TuiState {
  messages: Accessor<TranscriptMessage[]>;
  status: Accessor<TuiStatus>;
  currentInput: Accessor<string>;
  /** Live mode (Tab cycles plan → agent → yolo → plan). Optional for older callers. */
  mode?: Accessor<ToolMode>;
  /** Live reasoning effort (Shift+Tab cycles off → high → max → off). */
  effort?: Accessor<ReasoningEffort>;
  /** Cumulative usage stats (cache + tokens) shown in the status bar. */
  usage?: Accessor<UsageDisplay | undefined>;
  /** Mikan-cloud wallet balance (USD). Optional; status bar shows `wallet:?` when null. */
  walletBalance?: Accessor<number | null>;
  /** Cumulative session cost in USD. */
  costUsd?: Accessor<number>;
  /** Per-field config source layers — drives the status-bar source tag. */
  configSource?: Accessor<ConfigSources | undefined>;
  /** Pending Agent-mode tool approval request, if any. */
  approval?: Accessor<ToolApprovalState | null>;
  /** Slash commands visible to autocomplete and parser. Defaults to the TUI core set. */
  slashCommands?: Accessor<ReadonlyArray<SlashCommandSpec>>;
  /**
   * Past user submissions, oldest → newest. Drives Up/Down history recall
   * when the composer is empty (or while the user is browsing history).
   */
  submitHistory?: Accessor<ReadonlyArray<string>>;
  /** Whether vim modal editing is enabled in the composer. */
  vimEnabled?: Accessor<boolean>;
  /** When vim is enabled, which sub-mode the input is in. */
  vimSubMode?: Accessor<"normal" | "insert">;
}

/** Imperative actions surface. Caller (cli) implements them. */
export interface TuiActions {
  /** User submitted a non-empty composer line. */
  onSubmit: (text: string) => void;
  /** Cancel the in-flight stream (single Ctrl+C). */
  onCancel: () => void;
  /** Tear down the renderer and exit cleanly (double Ctrl+C / Ctrl+D). */
  onExit: () => Promise<void>;
  /** Tab cycles tool mode unless composer is completing a slash command. Optional. */
  onModeChange?: (next: ToolMode) => void;
  /** Shift+Tab cycles reasoning effort unless composer is completing a slash command. Optional. */
  onEffortChange?: (next: ReasoningEffort) => void;
  /**
   * User typed a slash command (e.g. `/model`, `/help`). Composer parses
   * the input and dispatches here instead of `onSubmit`. Phase 3.
   */
  onSlashCommand?: (cmd: SlashCommand, raw: string) => void;
  /** Composer input changed. Lets App-level key handlers know if input is empty. */
  onInputChange?: (text: string) => void;
  /** Resolve the pending tool approval prompt. */
  onApprovalDecision?: (approved: boolean) => void;
  /**
   * Vim sub-mode change request from the App keyboard handler.
   * Fires when vimEnabled is true and the user presses `i`/`a` (→ "insert")
   * or `Escape` (→ "normal"). The CLI owns the actual signal so the change
   * is observable everywhere reactive.
   */
  onVimSubModeChange?: (next: "normal" | "insert") => void;
}

/** Static info shown in status bar / splash. */
export interface TuiContext {
  provider: string;
  model: string;
  mode: ToolMode;
}

export interface MountOptions extends TuiContext {
  state: TuiState;
  actions: TuiActions;
}
