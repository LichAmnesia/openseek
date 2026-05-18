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

import rootPkg from "../../../package.json" with { type: "json" };

import { HELP_TEXT, parseArgv, type ParsedArgv } from "./argv.ts";
import { runDoctor } from "./doctor.ts";
import { runInteractive, type InteractiveOpts } from "./interactive.ts";
import { buildWizardProviders } from "./runtime-switch.ts";
import { shouldRunSetup } from "./setup-gate.ts";
import { userMessage } from "./wire.ts";
import { missingApiKeyMessage, providerRequiresApiKey } from "./provider-auth.ts";

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
      initial: { provider: config.provider, model: config.model },
    });
    if (!result) {
      console.log("setup cancelled — run `openseek` again to retry, or pass --no-setup");
      return { exitCode: 0 };
    }
    saveUserConfig({
      provider: result.provider,
      model: result.model,
      apiKey: result.apiKey,
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
    if (providerChanged || modelChanged || persistApiKey) {
      const payload: Parameters<typeof saveUserConfig>[0] = {
        provider: next.provider.id,
        model: next.modelId,
      };
      if (persistApiKey) payload.apiKey = next.apiKey;
      if (providerChanged && next.baseURL === undefined) payload.baseURL = null;
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
 *     F1.5 gate).
 */
export function buildSubcommandSavePayload(args: {
  name: "setup" | "model";
  result: { provider: string; model: string; apiKey: string };
  config: { provider: string; model: string; apiKey: string };
  configSource: { apiKey: import("@openseek/provider").ConfigSource };
}): Parameters<typeof saveUserConfig>[0] {
  if (args.name === "model") {
    return { model: args.result.model };
  }
  const payload: Parameters<typeof saveUserConfig>[0] = {
    provider: args.result.provider,
    model: args.result.model,
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
}

async function runOneShot(opts: OneShotOpts): Promise<RunResult> {
  if (providerRequiresApiKey(opts.provider) && !opts.apiKey) {
    console.error(`error: ${missingApiKeyMessage(opts.provider)}`);
    return { exitCode: 2 };
  }
  const messages: OpenSeekMessage[] = [userMessage(opts.prompt)];
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
    cwd: process.cwd(),
  });
  for await (const evt of runSession(state, {
    provider: opts.provider,
    model: opts.modelId,
    tools: tools.toMap(),
    capability: cap,
    apiKey: opts.apiKey,
    baseURL: opts.baseURL,
    signal: ctl.signal,
  })) {
    if (evt.type === "text-delta") process.stdout.write(evt.delta);
    if (evt.type === "thinking-delta") {
      process.stderr.write(`\x1b[2;3m${evt.delta}\x1b[0m`);
    }
    if (evt.type === "tool-call") process.stderr.write(`\n[tool ${evt.call.name}] `);
    if (evt.type === "error") {
      console.error(`\nerror: ${evt.err instanceof Error ? evt.err.message : String(evt.err)}`);
      return { exitCode: 1 };
    }
    if (evt.type === "cancelled") {
      console.error("\n[cancelled]");
      return { exitCode: 130 };
    }
    if (evt.type === "turn-end") {
      process.stdout.write("\n");
    }
  }
  return { exitCode: 0 };
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
