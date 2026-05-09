// Command surface for OpenSeek slash commands.
// v0.4 G4.1/G4.2: 108 stable command names, ~50 with real impls.

export type CommandCategory =
  | "session"
  | "config"
  | "auth"
  | "tools"
  | "git"
  | "agent"
  | "skills"
  | "diagnostics"
  | "ide"
  | "advanced";

export type CommandKind = "text" | "action";

/**
 * Result returned by a command handler.
 *  - "text"   → simple message to render in the TUI message log.
 *  - "action" → semantic action (e.g. clear-history, exit, switch-model)
 *               for the harness to interpret. `payload.action` is the verb.
 */
export interface CommandResult {
  kind: CommandKind;
  payload: {
    text?: string;
    action?: string;
    data?: unknown;
  };
}

/**
 * Minimal context handed to each command. Most fields are optional so stub
 * commands can be exercised in isolation under tests with `{}`.
 */
export interface CommandContext {
  cwd?: string;
  args?: string[];
  /** Mutable counters/state the command may inspect or update. */
  state?: Record<string, unknown>;
  /** Hook to mutate the active session message log (clear/compact). */
  session?: {
    messages?: unknown[];
    model?: string;
    effort?: "low" | "medium" | "high";
    mode?: "plan" | "agent" | "yolo";
    theme?: string;
    outputStyle?: string;
    vimEnabled?: boolean;
  };
  /** Surface for command handlers that need to spawn shell commands. */
  spawn?: (cmd: string[], opts?: { cwd?: string }) => Promise<{
    stdout: string;
    stderr: string;
    exitCode: number;
  }>;
}

export interface Command {
  name: string;
  description: string;
  category: CommandCategory;
  /** When true, handler returns a stock "v1.0 will implement" message. */
  isStub: boolean;
  handle: (ctx: CommandContext) => Promise<CommandResult>;
}
