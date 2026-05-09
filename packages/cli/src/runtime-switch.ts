// Runtime model/provider switch helpers (Phase 3).
//
// The user types `/model` or `/provider` inside the TUI. We tear the main
// renderer down, spin up the wizard at the requested step, save the result
// to ~/.openseek/config.toml, and re-mount the TUI with fresh provider /
// model bindings.
//
// IMPLEMENTATION CHOICE: tear-down + re-mount loop, NOT in-place patching.
//
//   * runInteractive resolves with `{ exitCode, switchTo? }`.
//   * The CLI entry point loops `runInteractive` while a `switchTo` exists.
//   * Transcript / wireMessages do NOT survive the switch — fresh session.
//     This matches the user's mental model ("/model is a fresh start with a
//     new model") and avoids the messy edge case where the new model can't
//     consume the old transcript (different cap/protocol).
//
// Pure helper here: nextOpts() turns the wizard's WizardResult into the
// next InteractiveOpts. Tested in isolation.

import {
  defaultProvider,
  getProvider,
  loadConfig,
  listProviderListings,
  saveUserConfig,
  type LLMProvider,
} from "@openseek/provider";
import type { CommandResult } from "@openseek/command";
import {
  runWizard,
  SLASH_COMMANDS,
  type SlashCommand,
  type SlashCommandSpec,
  type TranscriptMessage,
  type WizardProviderInfo,
  type WizardResult,
  type WizardStep,
} from "@openseek/tui";

import type { InteractiveOpts, InteractiveResult } from "./interactive.ts";

/** Build the next InteractiveOpts from the wizard result. Pure. */
export function nextOpts(current: InteractiveOpts, result: WizardResult): InteractiveOpts {
  const provider: LLMProvider = getProvider(result.provider) ?? defaultProvider();
  // F1.5: track whether the wizard surface ACTUALLY changed the apiKey vs.
  // just echoed back the value we seeded it with. The CLI loop uses this to
  // decide whether to persist a (possibly env-sourced) key to disk — leaking
  // an env-sourced secret to ~/.openseek/config.toml is the bug we're
  // dodging.
  const apiKeyChanged = result.apiKey !== current.apiKey;
  const next: InteractiveOpts = {
    provider,
    modelId: result.model,
    apiKey: result.apiKey,
    apiKeyChanged,
  };
  // Preserve a baseURL only for same-provider model switches. A provider
  // switch must fall back to the new provider's default endpoint; otherwise
  // `/provider openai` after `custom` keeps sending OpenAI traffic to the
  // custom server.
  if (result.provider === current.provider.id && current.baseURL !== undefined) {
    next.baseURL = current.baseURL;
  }
  // Carry the source map forward — the CLI loop reads it to decide whether
  // saving the apiKey is safe (env source → never persist).
  if (current.configSource !== undefined) next.configSource = current.configSource;
  return next;
}

/** Pull picker-ready providers out of the registry for the wizard. */
export function buildWizardProviders(): WizardProviderInfo[] {
  return listProviderListings().map((l) => {
    const out: WizardProviderInfo = {
      id: l.id,
      label: l.label,
      description: l.description,
      defaultModel: l.defaultModel,
    };
    if (l.availableModels !== undefined) out.availableModels = l.availableModels;
    return out;
  });
}

export interface RuntimeSwitchOpts {
  scope: "model" | "provider" | "apiKey";
  current: InteractiveOpts;
  initial?: Partial<WizardResult>;
}

/**
 * Run the wizard at the requested step, seeded with the current session's
 * provider/model/apiKey. Returns the new InteractiveOpts on success, or
 * null when the user cancelled (Esc / Ctrl+C).
 *
 * The caller is responsible for tearing down the main TUI BEFORE calling
 * this — the wizard creates its own renderer.
 */
export async function runtimeSwitch(opts: RuntimeSwitchOpts): Promise<WizardResult | null> {
  const initialStep: WizardStep =
    opts.scope === "model" ? "model" : opts.scope === "apiKey" ? "apiKey" : "provider";
  const result = await runWizard({
    providers: buildWizardProviders(),
    initial: {
      provider: opts.initial?.provider ?? opts.current.provider.id,
      model: opts.initial?.model ?? opts.current.modelId,
      apiKey: opts.initial?.apiKey ?? opts.current.apiKey,
    },
    initialStep,
  });
  return result;
}

// ---------- slash-command dispatch ----------

export interface SlashContext {
  current: InteractiveOpts;
  abortInflight: () => void;
  /**
   * Bug 3.2 fix: bump the routing epoch so events from the doomed iterator
   * are dropped before they touch the freshly-cleared transcript / status.
   * Always called BEFORE abortInflight + clearMessages so the order is:
   *   1. epoch bump  → routing.apply now drops in-flight events
   *   2. abortInflight → ai-SDK starts unwinding
   *   3. clearMessages → transcript/status reset visible to the user
   */
  bumpEpoch: () => number;
  /**
   * Bug 3.3 fix: settle the in-flight stream before tearing down the mount.
   * Bounded by a 2s timeout in interactive.ts. Without this, the wizard
   * renderer can spin up while the previous CliRenderer's destroy is still
   * resolving the async generator, producing overlapping render frames.
   */
  awaitInflight: () => Promise<void>;
  destroyMount: () => Promise<void>;
  appendRow: (row: TranscriptMessage) => void;
  clearMessages: () => void;
  resolveResult: (r: InteractiveResult) => void;
  slashCommands?: ReadonlyArray<SlashCommandSpec>;
  runCommand?: (name: string, args: string[]) => Promise<CommandResult | null>;
  setMode?: (mode: "plan" | "agent" | "yolo") => void;
  setEffort?: (effort: "off" | "high" | "max") => void;
  setOutputStyle?: (style: string) => void;
  /** Returns the most recent rendered assistant text (for /copy). */
  lastAssistantText?: () => string | null;
  /** Push `text` into the user's terminal clipboard via OSC52. */
  copyToClipboard?: (text: string) => boolean;
  /** T2: /color — flip NO_COLOR / FORCE_COLOR env vars at runtime. */
  setColorMode?: (mode: "auto" | "always" | "never") => void;
  /** T3: /debug — append a routing-event line to ~/.openseek/debug.log. */
  appendDebugLog?: (entry: { ts: string; type: string; data?: unknown }) => void;
  /** T4: /skills install — git clone a skill repo into .openseek/skills/. */
  installSkill?: (spec: string) => Promise<void>;
  /**
   * Post-v1.0 D-class wiring: /compact triggers a one-shot compaction
   * pass over the live wireMessages buffer. Implementation lives in
   * interactive.ts so it can mutate the in-memory wire array; this hook
   * shape lets dispatchSlash invoke it without holding a wire reference.
   */
  triggerCompact?: () => Promise<void>;
  /**
   * Post-v1.0 batch-3 D-class wiring: /theme — flip the live TUI theme
   * via the @openseek/tui setCurrentTheme signal. Name guarded by the
   * handler's whitelist; this hook just forwards the verified value.
   */
  setTheme?: (name: string) => void;
  /**
   * Post-v1.0 batch-3 D-class wiring: /vim — toggle modal cursor mode in
   * the composer. Sets vimEnabled and resets sub-mode to "insert" so the
   * user can keep typing immediately after enabling.
   */
  setVim?: (on: boolean) => void;
}

/**
 * Closed list of `action` verbs every command in `cmds/*.ts` is allowed to
 * emit. Add a new action HERE first, then case it in `applyCommandResult`
 * — TypeScript's `never` check in the default branch will otherwise fail
 * the build, which is the regression guard against silent fall-through.
 *
 * Keep in sync with the `action: "..."` literals in `packages/command/src`
 * (validated at runtime by `tests/applyCommandResult-coverage.test.ts`).
 */
export type SlashActionVerb =
  | "add-dir"
  | "break-cache"
  | "clear-history"
  | "compact-session"
  | "copy-last"
  | "enter-plan-mode"
  | "exit"
  | "install-skill"
  | "logout"
  | "memory-clear"
  | "memory-edit"
  | "set-color"
  | "set-effort"
  | "set-output-style"
  | "set-theme"
  | "switch-model"
  | "toggle-debug"
  | "toggle-fast"
  | "toggle-vim";

let sysRowSeq = 0;
const sysRow = (text: string): TranscriptMessage => {
  sysRowSeq += 1;
  return { id: `sys-${Date.now()}-${sysRowSeq}`, kind: "system", text };
};

const helpText = (commands: ReadonlyArray<SlashCommandSpec> = SLASH_COMMANDS): string =>
  commands.map((c) => `${c.name} — ${c.description}`).join("\n");

const unknownText = (cmd: string): string =>
  cmd === "" ? "type a slash command — try /help" : `unknown command: /${cmd} — try /help`;

/**
 * Handle a parsed SlashCommand. Mutates the live transcript via the
 * supplied callbacks and (for `/quit`, `/model`, `/provider`) resolves
 * the runInteractive promise so the caller can decide what to do next.
 */
export async function dispatchSlash(ctx: SlashContext, cmd: SlashCommand): Promise<void> {
  switch (cmd.type) {
    case "help":
      if (ctx.runCommand) {
        const result = await ctx.runCommand("help", cmd.args);
        if (result) {
          await applyCommandResult(ctx, result);
          return;
        }
      }
      ctx.appendRow(sysRow(helpText(ctx.slashCommands)));
      return;
    case "clear":
      // Bug 3.2 fix order: bump epoch → abort → clear. The epoch flip
      // guarantees stale events from the iterator can't append to the
      // freshly-empty transcript or flip status="cancelled".
      ctx.bumpEpoch();
      ctx.abortInflight();
      ctx.clearMessages();
      return;
    case "quit":
      ctx.bumpEpoch();
      ctx.abortInflight();
      await ctx.awaitInflight();
      await ctx.destroyMount();
      ctx.resolveResult({ exitCode: 0 });
      return;
    case "model":
      if (cmd.args.length > 0 && ctx.runCommand) {
        const result = await ctx.runCommand("model", cmd.args);
        if (result) {
          await applyCommandResult(ctx, result);
          return;
        }
      }
      // fall through to picker when /model has no args or the command runner is absent.
      {
        // Bug 3.3 fix: epoch bump + await drain BEFORE destroyMount so the
        // wizard renderer doesn't overlap with the dying stream/renderer.
        ctx.bumpEpoch();
        ctx.abortInflight();
        await ctx.awaitInflight();
        await ctx.destroyMount();
        const result = await runtimeSwitch({ scope: cmd.type, current: ctx.current });
        if (result === null) {
          // Cancel → re-mount with the SAME opts so the TUI re-appears.
          ctx.resolveResult({ exitCode: 0, switchTo: ctx.current });
          return;
        }
        ctx.resolveResult({ exitCode: 0, switchTo: nextOpts(ctx.current, result) });
        return;
      }
    case "provider": {
      // Bug 3.3 fix: epoch bump + await drain BEFORE destroyMount so the
      // wizard renderer doesn't overlap with the dying stream/renderer.
      ctx.bumpEpoch();
      ctx.abortInflight();
      await ctx.awaitInflight();
      await ctx.destroyMount();
      const result = await runtimeSwitch({ scope: cmd.type, current: ctx.current });
      if (result === null) {
        // Cancel → re-mount with the SAME opts so the TUI re-appears.
        ctx.resolveResult({ exitCode: 0, switchTo: ctx.current });
        return;
      }
      ctx.resolveResult({ exitCode: 0, switchTo: nextOpts(ctx.current, result) });
      return;
    }
    case "command": {
      const result = await ctx.runCommand?.(cmd.name, cmd.args);
      if (!result) {
        ctx.appendRow(sysRow(unknownText(cmd.name)));
        return;
      }
      await applyCommandResult(ctx, result);
      return;
    }
    case "unknown":
      ctx.appendRow(sysRow(unknownText(cmd.command)));
      return;
  }
}

/**
 * Apply a CommandResult to live TUI state.
 *
 * Audit history (post-flicker bug):
 *   pre-fix every action used a sequential `if (action === "...")`
 *   chain that fell through to a generic `appendRow(text)`. Any new
 *   action emitted by `cmds/*.ts` was silently dropped — the user
 *   saw the confirmation text ("theme → dark") and assumed it
 *   worked, but no UI state actually changed. 11 commands were
 *   broken this way.
 *
 *   Post-fix this function is an exhaustive `switch` over the
 *   `SlashActionVerb` union. The default branch's `never` cast forces
 *   TypeScript to error if a new verb is added to the union without
 *   a matching case. The verb union itself is enforced at runtime by
 *   `applyCommandResult-coverage.test.ts`, which scans `cmds/*.ts`
 *   for `action: "..."` literals.
 *
 * Categories of cases below:
 *   A. STATE TRANSITIONS — handled in cli/tui (clear-history, exit,
 *      switch-model, enter-plan-mode, set-effort, set-output-style,
 *      logout). These call ctx hooks that mutate signals or
 *      tear-down the mount.
 *   B. HANDLER DID THE WORK — the command's `handle()` already
 *      mutated state (memory-edit, memory-clear, add-dir,
 *      break-cache). We only need to surface the confirmation text.
 *   C. SIDE-EFFECT VIA CTX — copy-last needs the renderer's
 *      OSC52 channel, exposed via ctx.copyToClipboard.
 *   D. NOT YET IMPLEMENTED — empty after batch-3. Every verb in the union
 *      now lands in A/B/C with real behavior. The block remains as a
 *      structural placeholder so the next contributor adding a stub
 *      command has a documented landing spot. The `applyCommandResult-
 *      coverage.test.ts` meta-test asserts the block stays empty.
 */
async function applyCommandResult(ctx: SlashContext, result: CommandResult): Promise<void> {
  const text = result.payload.text;
  const action = result.payload.action as SlashActionVerb | undefined;

  // No action verb → plain text result. Just surface the message.
  if (action === undefined) {
    if (text) ctx.appendRow(sysRow(text));
    return;
  }

  switch (action) {
    // ---- A. State transitions ----
    case "clear-history":
      ctx.bumpEpoch();
      ctx.abortInflight();
      ctx.clearMessages();
      return;

    case "exit":
      ctx.bumpEpoch();
      ctx.abortInflight();
      await ctx.awaitInflight();
      await ctx.destroyMount();
      ctx.resolveResult({ exitCode: 0 });
      return;

    case "switch-model": {
      const data = result.payload.data as { provider?: string; model?: string } | undefined;
      if (!data?.provider || !data.model) return;
      ctx.bumpEpoch();
      ctx.abortInflight();
      await ctx.awaitInflight();
      await ctx.destroyMount();
      if (data.provider !== ctx.current.provider.id) {
        const wizardResult = await runtimeSwitch({
          scope: "apiKey",
          current: ctx.current,
          initial: {
            provider: data.provider,
            model: data.model,
            apiKey: seedApiKeyForProviderSwitch(data.provider),
          },
        });
        if (wizardResult === null) {
          ctx.resolveResult({ exitCode: 0, switchTo: ctx.current });
          return;
        }
        ctx.resolveResult({ exitCode: 0, switchTo: nextOpts(ctx.current, wizardResult) });
        return;
      }
      ctx.resolveResult({
        exitCode: 0,
        switchTo: nextOpts(ctx.current, {
          provider: data.provider,
          model: data.model,
          apiKey: ctx.current.apiKey,
        }),
      });
      return;
    }

    case "enter-plan-mode":
      ctx.setMode?.("plan");
      if (text) ctx.appendRow(sysRow(text));
      return;

    case "set-effort": {
      const effort = mapCommandEffort(
        (result.payload.data as { effort?: string } | undefined)?.effort,
      );
      if (effort) ctx.setEffort?.(effort);
      if (text) ctx.appendRow(sysRow(text));
      return;
    }

    case "set-output-style": {
      const style = (result.payload.data as { style?: string } | undefined)?.style;
      if (style) ctx.setOutputStyle?.(style);
      if (text) ctx.appendRow(sysRow(text));
      return;
    }

    case "logout":
      // Clear the persisted api_key so the next launch trips the
      // first-run wizard. Empty-string + `force` semantics: writing
      // an empty value to the merged TOML overwrites whatever was
      // there. We don't tear down the current session — the user
      // can keep using the in-memory key until they /quit, then
      // restart fresh. Telling them this explicitly avoids the
      // "I clicked logout but I'm still logged in" trap.
      try {
        saveUserConfig({ apiKey: "" });
      } catch (err) {
        ctx.appendRow(
          sysRow(`logout failed to clear config: ${err instanceof Error ? err.message : String(err)}`),
        );
        return;
      }
      ctx.appendRow(sysRow("logged out — the persisted api_key has been cleared. Run /quit + relaunch to re-auth."));
      return;

    // ---- B. Handler already did the work ----
    case "add-dir":
    case "break-cache":
    case "memory-edit":
    case "memory-clear":
    // toggle-fast: handler already flipped commandState.fastMode. The
    // interactive runtime reads that flag on the NEXT onSubmit and
    // swaps in cap.fastVariant per-turn — no further state change here.
    case "toggle-fast":
      if (text) ctx.appendRow(sysRow(text));
      return;

    // ---- C. Side-effect via ctx ----
    case "copy-last": {
      const last = ctx.lastAssistantText?.();
      if (!last) {
        ctx.appendRow(sysRow("nothing to copy — no assistant message in this session yet."));
        return;
      }
      const ok = ctx.copyToClipboard?.(last) ?? false;
      ctx.appendRow(
        sysRow(
          ok
            ? `copied last assistant message (${last.length} chars) to clipboard via OSC52.`
            : "copy failed — terminal does not support OSC52 clipboard. Select with mouse instead.",
        ),
      );
      return;
    }

    // ---- A. State transition (env-side; takes effect on next stdout write) ----
    case "set-color": {
      const mode = (result.payload.data as { color?: string } | undefined)?.color;
      if (mode === "auto" || mode === "always" || mode === "never") {
        ctx.setColorMode?.(mode);
      }
      if (text) ctx.appendRow(sysRow(text));
      return;
    }

    // ---- B. Handler did the work (state already mutated). Side-effect: log to disk. ----
    case "toggle-debug": {
      // Append a synthetic record so the debug.log line on toggle is the
      // first proof the file is being written. Subsequent routing events
      // append from the for-await loop in interactive.ts.
      ctx.appendDebugLog?.({
        ts: new Date().toISOString(),
        type: "toggle-debug",
        data: result.payload.data,
      });
      if (text) ctx.appendRow(sysRow(text));
      return;
    }

    // ---- C. Side-effect via ctx (async install). ----
    case "install-skill": {
      const spec = (result.payload.data as { spec?: string } | undefined)?.spec;
      if (!spec) {
        ctx.appendRow(sysRow("install-skill: missing spec — usage: /skills install <owner/repo>"));
        return;
      }
      if (!ctx.installSkill) {
        ctx.appendRow(sysRow("install-skill: not wired (no installer in this host)"));
        return;
      }
      try {
        await ctx.installSkill(spec);
      } catch (err) {
        const m = err instanceof Error ? err.message : String(err);
        ctx.appendRow(sysRow(`install-skill failed: ${m}`));
      }
      return;
    }

    // ---- C. Side-effect via ctx (mutates wire-history buffer in interactive.ts). ----
    case "compact-session": {
      if (!ctx.triggerCompact) {
        ctx.appendRow(
          sysRow("compact: not wired (no compactor in this host) — message buffer unchanged"),
        );
        return;
      }
      try {
        await ctx.triggerCompact();
      } catch (err) {
        const m = err instanceof Error ? err.message : String(err);
        ctx.appendRow(sysRow(`compact failed: ${m}`));
      }
      return;
    }

    // ---- A. State transition (live theme swap via @openseek/tui signal). ----
    case "set-theme": {
      const next = (result.payload.data as { theme?: string } | undefined)?.theme;
      if (next) ctx.setTheme?.(next);
      if (text) ctx.appendRow(sysRow(text));
      return;
    }

    // ---- A. State transition (vim modal cursor in composer). ----
    case "toggle-vim": {
      const on = (result.payload.data as { vim?: boolean } | undefined)?.vim;
      if (typeof on === "boolean") ctx.setVim?.(on);
      if (text) ctx.appendRow(sysRow(text));
      return;
    }

    // ---- D. Not yet implemented — empty after batch-3 (placeholder). ----

    default: {
      // Unreachable when SlashActionVerb stays in sync with cmds/*.ts.
      // The `never` cast turns "new verb forgot to add a case" into a
      // compile error.
      const _exhaustive: never = action;
      ctx.appendRow(sysRow(`${text ?? "(unknown action)"} — unhandled action verb: ${String(_exhaustive)}`));
      return;
    }
  }
}

function mapCommandEffort(effort: string | undefined): "off" | "high" | "max" | null {
  if (effort === "low") return "off";
  if (effort === "medium") return "high";
  if (effort === "high") return "max";
  return null;
}

function seedApiKeyForProviderSwitch(provider: string): string {
  const config = loadConfig(process.cwd(), {
    env: { ...process.env, OPENSEEK_PROVIDER: provider },
  });
  return config.source.apiKey === "env" ? config.apiKey : "";
}
