// @openseek/cli — main entry. Wires provider + tool registry + session loop +
// TUI together. Runs as binary when executed directly; exports `runOpenseek`
// for tests.
//
// SPEC: G1.8 (bundle < 5MB, runs standalone).

import {
  defaultProvider,
  getProvider,
  loadConfig,
  saveUserConfig,
  type LLMProvider,
  type OpenSeekMessage,
} from "@openseek/provider";
import { defaultRegistry as defaultToolRegistry, setAgentSpawnDeps } from "@openseek/tool";
import { runSession, type SessionState } from "@openseek/session";

import { runWizard, type WizardStep } from "@openseek/tui";
import { startServer } from "@openseek/server";

import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

import rootPkg from "../../../package.json" with { type: "json" };

import { HELP_TEXT, parseArgv, type ParsedArgv } from "./argv.ts";
import { runDoctor } from "./doctor.ts";
import { runInteractive, type InteractiveOpts } from "./interactive.ts";
import { buildWizardProviders } from "./runtime-switch.ts";
import { shouldRunSetup } from "./setup-gate.ts";
import { userMessage } from "./wire.ts";
import {
  missingApiKeyMessage,
  missingBaseURLMessage,
  providerRequiresApiKey,
  providerRequiresBaseURL,
} from "./provider-auth.ts";

export const PACKAGE_NAME = "@openseek/cli";
export const VERSION: string = (rootPkg as { version: string }).version;

export interface RunResult {
  /** 0 on clean exit, non-zero for errors. */
  exitCode: number;
}

/**
 * Main entrypoint. Takes argv, returns exit code. Does not call process.exit
 * itself so tests can drive it.
 */
export async function runOpenseek(argv: string[]): Promise<RunResult> {
  const args = parseArgv(argv);
  const workspace = process.cwd();

  if (args.version) {
    console.log(`openseek ${VERSION}`);
    return { exitCode: 0 };
  }
  if (args.help) {
    console.log(HELP_TEXT);
    return { exitCode: 0 };
  }

  if (args.subcommand === "serve") {
    return await runServe(args);
  }

  if (args.subcommand === "doctor") {
    return runDoctor(workspace);
  }

  // Subcommands that ALWAYS run the wizard, then exit (no TUI loop after).
  if (args.subcommand === "setup" || args.subcommand === "model") {
    return await runWizardSubcommand(args.subcommand, workspace);
  }

  let config = loadCliConfig(workspace);

  if (shouldRunSetup({ config, args, isTTY: Boolean(process.stdin.isTTY) })) {
    const result = await runWizard({
      providers: buildWizardProviders(),
      initial: { provider: config.provider, model: config.model, baseURL: config.baseURL },
    });
    if (!result) {
      console.log("setup cancelled — run `openseek` again to retry, or pass --no-setup");
      return { exitCode: 0 };
    }
    saveUserConfig({
      provider: result.provider,
      model: result.model,
      apiKey: result.apiKey,
      // Persist the wizard's baseURL; a provider without one clears any
      // stale base_url so it can't leak onto the new provider's traffic.
      baseURL: result.baseURL ?? null,
    });
    // Re-resolve so source.apiKey flips from "default" to "user".
    config = loadCliConfig(workspace);
  }

  const providerId = args.provider ?? config.provider;
  const modelId = args.model ?? config.model;
  const provider = getProvider(providerId) ?? defaultProvider();

  if (args.prompt !== undefined) {
    return await runOneShot({
      provider,
      modelId,
      apiKey: config.apiKey,
      baseURL: config.baseURL,
      prompt: args.prompt,
      format: args.format,
      cwd: workspace,
      maxSteps: args.maxSteps,
    });
  }

  const initial: InteractiveOpts = {
    provider,
    modelId,
    apiKey: config.apiKey,
    configSource: config.source,
  };
  if (config.baseURL !== undefined) initial.baseURL = config.baseURL;
  return await runInteractiveLoop(initial, workspace);
}

/** CLI config always includes the current workspace overlay. */
export function loadCliConfig(
  workspace: string = process.cwd(),
  ioOverride?: Parameters<typeof loadConfig>[1],
): ReturnType<typeof loadConfig> {
  return loadConfig(workspace, ioOverride);
}

/**
 * Drive runInteractive in a loop so `/model` / `/provider` can swap the
 * provider+model+apiKey live. Persists provider/model on drift; persists
 * apiKey only when the wizard actually changed it AND the prior source
 * wasn't env (F1.5: env-sourced keys must not leak to disk).
 */
async function runInteractiveLoop(initial: InteractiveOpts, workspace: string): Promise<RunResult> {
  let opts = initial;
  while (true) {
    const result = await runInteractive(opts);
    if (!result.switchTo) return { exitCode: result.exitCode };
    const next = result.switchTo;
    const providerChanged = next.provider.id !== opts.provider.id;
    const modelChanged = next.modelId !== opts.modelId;
    const persistApiKey = next.apiKeyChanged === true && opts.configSource?.apiKey !== "env";
    // Persist a baseURL the wizard changed (custom endpoint); env-sourced
    // values are carried through unchanged so they never hit this branch.
    const baseURLChanged = next.baseURL !== opts.baseURL;
    if (providerChanged || modelChanged || persistApiKey || baseURLChanged) {
      const payload: Parameters<typeof saveUserConfig>[0] = {
        provider: next.provider.id,
        model: next.modelId,
      };
      if (persistApiKey) payload.apiKey = next.apiKey;
      if (baseURLChanged) payload.baseURL = next.baseURL ?? null;
      else if (providerChanged && next.baseURL === undefined) payload.baseURL = null;
      saveUserConfig(payload);
      next.configSource = loadCliConfig(workspace).source;
    }
    opts = next;
  }
}

/**
 * F5 P0-NEW #2: persist gate for the `openseek setup` / `openseek model`
 * subcommand path. Pure helper so tests can drive it without spinning up
 * the wizard.
 *
 * Rules:
 *   * `model` subcommand → persist ONLY {model}. Never touch api_key /
 *     provider on disk (model-only switch is a model-only switch).
 *   * `setup` subcommand → persist {provider, model}. Persist apiKey only
 *     when the wizard ACTUALLY changed it AND the prior source wasn't env
 *     (env-sourced keys must not leak to disk — mirrors the runtime-loop
 *     F1.5 gate). base_url: persist the wizard's value; when the wizard
 *     produced none (provider doesn't take one), clear any stale base_url
 *     so it can't leak onto the new provider's traffic (G8.3).
 */
export function buildSubcommandSavePayload(args: {
  name: "setup" | "model";
  result: { provider: string; model: string; apiKey: string; baseURL?: string };
  config: { provider: string; model: string; apiKey: string };
  configSource: { apiKey: import("@openseek/provider").ConfigSource };
}): Parameters<typeof saveUserConfig>[0] {
  if (args.name === "model") {
    return { model: args.result.model };
  }
  const payload: Parameters<typeof saveUserConfig>[0] = {
    provider: args.result.provider,
    model: args.result.model,
    baseURL: args.result.baseURL ?? null,
  };
  const apiKeyChanged = args.result.apiKey !== args.config.apiKey;
  if (apiKeyChanged && args.configSource.apiKey !== "env") {
    payload.apiKey = args.result.apiKey;
  }
  return payload;
}

async function runWizardSubcommand(name: "setup" | "model", workspace: string): Promise<RunResult> {
  const config = loadCliConfig(workspace);
  const initialStep: WizardStep = name === "model" ? "model" : "provider";
  const result = await runWizard({
    providers: buildWizardProviders(),
    initial: {
      provider: config.provider,
      model: config.model,
      apiKey: config.apiKey,
      baseURL: config.baseURL,
    },
    initialStep,
  });
  if (!result) {
    console.log(`${name} cancelled — no changes saved`);
    return { exitCode: 1 };
  }
  // F5 P0-NEW #2: don't persist env-sourced apiKey, never touch api_key on
  // a `model` subcommand.
  const payload = buildSubcommandSavePayload({
    name,
    result,
    config: {
      provider: config.provider,
      model: config.model,
      apiKey: config.apiKey,
    },
    configSource: { apiKey: config.source.apiKey },
  });
  saveUserConfig(payload);
  console.log("[setup] saved → ~/.openseek/config.toml");
  return { exitCode: 0 };
}

interface OneShotOpts {
  provider: LLMProvider;
  modelId: string;
  apiKey: string;
  baseURL?: string;
  prompt: string;
  /** Output format: "text" (human) or "json" (NDJSON for headless callers). */
  format: "text" | "json";
  /** Workspace root — used for AGENTS.md discovery + tool execution cwd. */
  cwd: string;
  /** Max agent tool-steps (`--max-steps`); default ONE_SHOT_MAX_STEPS. */
  maxSteps?: number;
}

/**
 * One-shot default step budget. The interactive session cap (12) assumes a
 * human re-prompts each turn; a `-p` run must land the whole task in one
 * invocation, so long multi-phase workflows get room to work.
 */
const ONE_SHOT_MAX_STEPS = 100;

/**
 * System directive injected at the head of every one-shot (`-p`) run. A `-p`
 * invocation is non-interactive: there is no human in the loop to answer
 * follow-up questions or grant "continue?" permission. Without this, models
 * habitually finish one phase of a multi-step task and stop to ask whether to
 * proceed — which, with no tool call, ends the turn and makes the run report
 * success while the task is unfinished. This is the headless counterpart of the
 * interactive "yolo" mode: run the whole task through to the end autonomously.
 */
export const ONE_SHOT_AUTONOMY_DIRECTIVE = [
  "You are running in NON-INTERACTIVE one-shot mode. There is no human available",
  "to answer questions, confirm steps, or grant permission — any question you ask",
  "will go unanswered and end the run prematurely.",
  "",
  "Therefore:",
  "- Carry the task through to full completion on your own. Do NOT stop to ask",
  '  "should I continue?", "shall I proceed to the next phase?", or for approval.',
  "- If a task has multiple phases or steps, execute ALL of them in sequence",
  "  without pausing between them.",
  "- Make reasonable assumptions and proceed when a detail is ambiguous, rather",
  "  than halting to ask. State the assumption and continue.",
  "- Use your tools directly to do the work; do not merely describe what you",
  "  would do.",
  "- Only stop when the task is genuinely complete, or when you hit a hard",
  "  blocker (missing credentials/data, a failing external dependency) that",
  "  truly cannot be worked around — in which case finish by clearly reporting",
  "  exactly what blocked you and what was and was not done.",
].join("\n");

/**
 * Assemble the leading messages for a one-shot (`-p`) run: the non-interactive
 * autonomy directive first, then AGENTS.md project context (when present), then
 * the user prompt. runSession lifts the leading system messages into the
 * provider `system` parameter. Exported for testing.
 */
export function buildOneShotMessages(
  prompt: string,
  agentsCtx: string | null,
): OpenSeekMessage[] {
  const messages: OpenSeekMessage[] = [
    { role: "system", content: [{ type: "text", text: ONE_SHOT_AUTONOMY_DIRECTIVE }] },
  ];
  if (agentsCtx) {
    messages.push({ role: "system", content: [{ type: "text", text: agentsCtx }] });
  }
  messages.push(userMessage(prompt));
  return messages;
}

/**
 * Load project agent instructions (AGENTS.md) from the workspace root so a
 * one-shot run carries the same native project context an interactive user
 * would have. Mirrors the "native AGENTS.md discovery" contract that other
 * coding agents (opencode / codex) rely on: the HiveDesk daemon writes
 * AGENTS.md into the task workdir and expects the agent to read it. Returns
 * null when absent or empty.
 */
function loadAgentsContext(cwd: string): string | null {
  try {
    const p = join(cwd, "AGENTS.md");
    if (!existsSync(p)) return null;
    const text = readFileSync(p, "utf8").trim();
    return text.length > 0 ? text : null;
  } catch {
    return null;
  }
}

async function runOneShot(opts: OneShotOpts): Promise<RunResult> {
  const json = opts.format === "json";
  const emit = (o: Record<string, unknown>): void => {
    process.stdout.write(`${JSON.stringify(o)}\n`);
  };

  const failFast = (msg: string): RunResult => {
    if (json) {
      emit({ type: "error", message: msg });
      emit({ type: "done", status: "failed", sessionID: "" });
    } else {
      console.error(`error: ${msg}`);
    }
    return { exitCode: 2 };
  };

  if (providerRequiresApiKey(opts.provider) && !opts.apiKey) {
    return failFast(missingApiKeyMessage(opts.provider));
  }
  // G8.4: a requiresBaseURL provider (custom) without a configured base URL
  // would dial its non-routable stub, burn 3 SDK retries, and dump an opaque
  // connection error — refuse up front with an actionable message instead.
  if (providerRequiresBaseURL(opts.provider) && !opts.baseURL) {
    return failFast(missingBaseURLMessage(opts.provider));
  }

  const messages = buildOneShotMessages(opts.prompt, loadAgentsContext(opts.cwd));

  const state: SessionState = {
    messages,
    mode: "agent",
    reasoningEffort: "off",
    model: opts.modelId,
    provider: opts.provider.id,
  };
  const ctl = new AbortController();
  process.on("SIGINT", () => ctl.abort());
  const tools = defaultToolRegistry();
  const cap = opts.provider.capability(opts.modelId);
  setAgentSpawnDeps({
    provider: opts.provider,
    model: opts.modelId,
    tools: tools.toMap(),
    capability: cap,
    apiKey: opts.apiKey,
    baseURL: opts.baseURL,
    cwd: opts.cwd,
  });

  let status: "completed" | "failed" | "cancelled" = "completed";
  let exitCode = 0;

  for await (const evt of runSession(state, {
    provider: opts.provider,
    model: opts.modelId,
    tools: tools.toMap(),
    capability: cap,
    apiKey: opts.apiKey,
    baseURL: opts.baseURL,
    cwd: opts.cwd,
    signal: ctl.signal,
    maxSteps: opts.maxSteps ?? ONE_SHOT_MAX_STEPS,
  })) {
    if (json) {
      switch (evt.type) {
        case "text-delta":
          emit({ type: "text", text: evt.delta });
          break;
        case "thinking-delta":
          emit({ type: "thinking", text: evt.delta });
          break;
        case "tool-call":
          emit({ type: "tool_use", tool: evt.call.name, callID: evt.call.id, input: evt.call.input });
          break;
        case "tool-result": {
          const r = evt.result.result;
          const output =
            r.kind === "text" ? r.text : r.kind === "error" ? r.message : JSON.stringify(r);
          emit({
            type: "tool_result",
            tool: evt.result.name,
            callID: evt.result.id,
            output,
            isError: r.kind === "error",
          });
          break;
        }
        case "usage-update": {
          const s = evt.snapshot;
          emit({
            type: "usage",
            inputTokens: s.totalIn,
            outputTokens: s.totalOut,
            cacheReadTokens: s.cacheRead ?? 0,
            cacheCreationTokens: s.cacheCreation ?? 0,
            model: opts.modelId,
          });
          break;
        }
        case "error":
          emit({
            type: "error",
            message: evt.err instanceof Error ? evt.err.message : String(evt.err),
          });
          status = "failed";
          exitCode = 1;
          break;
        case "cancelled":
          status = "cancelled";
          exitCode = 130;
          break;
        // assistant-turn / finish / turn-end carry no NDJSON surface.
      }
    } else {
      if (evt.type === "text-delta") process.stdout.write(evt.delta);
      else if (evt.type === "thinking-delta") process.stderr.write(`\x1b[2;3m${evt.delta}\x1b[0m`);
      else if (evt.type === "tool-call") process.stderr.write(`\n[tool ${evt.call.name}] `);
      else if (evt.type === "error") {
        console.error(`\nerror: ${evt.err instanceof Error ? evt.err.message : String(evt.err)}`);
        return { exitCode: 1 };
      } else if (evt.type === "cancelled") {
        console.error("\n[cancelled]");
        return { exitCode: 130 };
      } else if (evt.type === "turn-end") {
        process.stdout.write("\n");
      }
    }
  }

  if (json) emit({ type: "done", status, sessionID: "" });
  return { exitCode };
}

async function runServe(args: ParsedArgv): Promise<RunResult> {
  if (!args.serveHttp) {
    console.error("error: only --http transport supported (try `openseek serve --http`)");
    return { exitCode: 2 };
  }
  const handle = startServer({
    port: args.port,
    host: args.host,
  });
  console.log(`[openseek] HTTP/SSE server listening on http://${handle.host}:${handle.port}`);
  console.log("  POST /v1/threads");
  console.log("  POST /v1/threads/:id/messages   (SSE)");
  console.log("  GET  /v1/usage?group_by=day|model|provider|thread");
  console.log("  GET  /healthz");
  return await new Promise<RunResult>((resolve) => {
    const shutdown = async () => {
      await handle.stop();
      resolve({ exitCode: 0 });
    };
    process.on("SIGINT", () => void shutdown());
    process.on("SIGTERM", () => void shutdown());
  });
}

if (import.meta.main) {
  const result = await runOpenseek(process.argv.slice(2));
  process.exit(result.exitCode);
}
