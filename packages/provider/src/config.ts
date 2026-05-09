// OpenSeek config loader.
//
// Layered precedence (highest first):
//   1. process.env  (OPENSEEK_* plus provider-specific API/base URL vars)
//   2. project overlay  <workspace>/.openseek/config.toml  (sandboxed —
//      api_key / base_url / provider fields are silently dropped)
//   3. user config  ~/.openseek/config.toml
//   4. built-in defaults

import * as TOML from "@iarna/toml";
import { homedir } from "node:os";
import { join } from "node:path";
import { z } from "zod";

export type ConfigSource = "env" | "project" | "user" | "default";

export interface ConfigSources {
  provider: ConfigSource;
  model: ConfigSource;
  apiKey: ConfigSource;
  baseURL?: ConfigSource;
}

export interface ResolvedConfig {
  provider: string;
  model: string;
  apiKey: string;
  baseURL?: string;
  /** Per-field origin layer (env > project > user > default). */
  source: ConfigSources;
}

const userConfigSchema = z
  .object({
    provider: z.string().optional(),
    model: z.string().optional(),
    api_key: z.string().optional(),
    base_url: z.string().optional(),
  })
  .partial();

const overlayConfigSchema = z
  .object({
    model: z.string().optional(),
  })
  .partial();

const PROJECT_OVERLAY_BLOCKED = ["api_key", "base_url", "provider"] as const;

const DEFAULTS = {
  provider: "mikan",
  model: "deepseek-v4-flash",
  apiKey: "",
} as const;

interface LoadEnv {
  OPENSEEK_PROVIDER?: string;
  OPENSEEK_MODEL?: string;
  OPENSEEK_API_KEY?: string;
  OPENSEEK_BASE_URL?: string;
  [key: string]: string | undefined;
}

interface LoadIO {
  readFile: (path: string) => string | undefined;
  warn: (msg: string) => void;
  home: string;
  env: LoadEnv;
}

const defaultIO: LoadIO = {
  readFile: (path) => {
    // Synchronous read so loadConfig can stay sync (called once at boot).
    // Use require() since top-level imports add to the per-call cost.
    const fs = require("node:fs") as typeof import("node:fs");
    try {
      if (!fs.existsSync(path)) return undefined;
      return fs.readFileSync(path, "utf8");
    } catch {
      return undefined;
    }
  },
  warn: (msg) => {
    console.warn(`[openseek/config] ${msg}`);
  },
  home: homedir(),
  env: process.env as LoadEnv,
};

export function loadConfig(workspace?: string, ioOverride?: Partial<LoadIO>): ResolvedConfig {
  const io: LoadIO = { ...defaultIO, ...ioOverride };

  const userPath = join(io.home, ".openseek", "config.toml");
  const userRaw = io.readFile(userPath);
  const user = parseUserConfig(userRaw, userPath, io.warn);

  const overlay =
    workspace !== undefined
      ? parseOverlayConfig(io.readFile(join(workspace, ".openseek", "config.toml")), io.warn)
      : {};

  const env = io.env;

  // F1.2: empty / whitespace-only env vars are normalized to undefined so
  // they don't shadow defaults (otherwise `OPENSEEK_API_KEY=""` would mark
  // source="env" and skip the wizard with a blank key in hand).
  const providerPick = pick(
    cleanEnv(env.OPENSEEK_PROVIDER),
    "env",
    user.provider,
    "user",
    DEFAULTS.provider,
  );
  const modelPick = pickFour(
    cleanEnv(env.OPENSEEK_MODEL),
    "env",
    overlay.model,
    "project",
    user.model,
    "user",
    DEFAULTS.model,
  );
  const apiKeyPick = pick(
    pickEnvValue(env, ["OPENSEEK_API_KEY", ...providerApiKeyEnvNames(providerPick.value)]),
    "env",
    user.api_key,
    "user",
    DEFAULTS.apiKey,
  );
  const baseURLPick = pickOptional(
    pickEnvValue(env, ["OPENSEEK_BASE_URL", ...providerBaseUrlEnvNames(providerPick.value)]),
    "env",
    user.base_url,
    "user",
  );

  const source: ConfigSources = {
    provider: providerPick.source,
    model: modelPick.source,
    apiKey: apiKeyPick.source,
  };
  if (baseURLPick !== undefined) source.baseURL = baseURLPick.source;

  return baseURLPick !== undefined
    ? {
        provider: providerPick.value,
        model: modelPick.value,
        apiKey: apiKeyPick.value,
        baseURL: baseURLPick.value,
        source,
      }
    : {
        provider: providerPick.value,
        model: modelPick.value,
        apiKey: apiKeyPick.value,
        source,
      };
}

/**
 * Normalize env-var values: undefined when missing, empty, or whitespace.
 * Without this, `OPENSEEK_API_KEY=""` would still be "set" per `!== undefined`
 * and the setup-gate would skip the wizard. (F1.2)
 */
function cleanEnv(value: string | undefined): string | undefined {
  if (value === undefined) return undefined;
  const trimmed = value.trim();
  return trimmed === "" ? undefined : trimmed;
}

function pickEnvValue(env: LoadEnv, names: string[]): string | undefined {
  for (const name of names) {
    const value = cleanEnv(env[name]);
    if (value !== undefined) return value;
  }
  return undefined;
}

function providerApiKeyEnvNames(provider: string): string[] {
  switch (provider) {
    case "mikan":
      return ["MIKAN_API_KEY"];
    case "openai":
      return ["OPENAI_API_KEY"];
    case "deepseek":
      return ["DEEPSEEK_API_KEY"];
    case "deepseek-cn":
      return ["DEEPSEEK_CN_API_KEY", "DEEPSEEK_API_KEY"];
    case "fireworks":
      return ["FIREWORKS_API_KEY"];
    case "nvidia-nim":
      return ["NVIDIA_NIM_API_KEY", "NVIDIA_API_KEY"];
    case "novita":
      return ["NOVITA_API_KEY"];
    case "openrouter":
      return ["OPENROUTER_API_KEY"];
    case "sglang":
      return ["SGLANG_API_KEY"];
    case "vllm":
      return ["VLLM_API_KEY"];
    case "groq":
      return ["GROQ_API_KEY"];
    case "together":
      return ["TOGETHER_API_KEY"];
    case "cerebras":
      return ["CEREBRAS_API_KEY"];
    case "deepinfra":
      return ["DEEPINFRA_API_KEY"];
    case "perplexity":
      return ["PERPLEXITY_API_KEY"];
    case "mistral":
      return ["MISTRAL_API_KEY"];
    case "xai":
      return ["XAI_API_KEY"];
    case "cohere":
      return ["COHERE_API_KEY"];
    case "vercel-gateway":
      return ["VERCEL_AI_GATEWAY_API_KEY"];
    case "anthropic":
      return ["ANTHROPIC_API_KEY"];
    case "azure-foundry":
      return ["AZURE_AI_API_KEY"];
    case "google":
      return ["GOOGLE_API_KEY", "GEMINI_API_KEY"];
    case "custom":
      return ["CUSTOM_API_KEY"];
    default:
      return [];
  }
}

function providerBaseUrlEnvNames(provider: string): string[] {
  switch (provider) {
    case "mikan":
      return ["MIKAN_BASE_URL"];
    case "openai":
      return ["OPENAI_BASE_URL"];
    case "deepseek":
      return ["DEEPSEEK_BASE_URL"];
    case "deepseek-cn":
      return ["DEEPSEEK_CN_BASE_URL", "DEEPSEEK_BASE_URL"];
    case "sglang":
      return ["SGLANG_BASE_URL"];
    case "vllm":
      return ["VLLM_BASE_URL"];
    case "ollama":
      return ["OLLAMA_BASE_URL"];
    case "azure-foundry":
      return ["AZURE_AI_ENDPOINT"];
    case "custom":
      return ["CUSTOM_BASE_URL"];
    default:
      return [];
  }
}

interface Picked<T> {
  value: T;
  source: ConfigSource;
}

// Three-layer pick: env → user → built-in default. Used for provider / apiKey
// where there is no project-overlay layer.
function pick<T extends string>(
  envVal: string | undefined,
  envSrc: ConfigSource,
  userVal: string | undefined,
  userSrc: ConfigSource,
  fallback: T,
): Picked<string> {
  if (envVal !== undefined) return { value: envVal, source: envSrc };
  if (userVal !== undefined) return { value: userVal, source: userSrc };
  return { value: fallback, source: "default" };
}

// Four-layer pick: env → project overlay → user → default. Only `model` uses
// this since the overlay sandbox blocks provider / apiKey / baseURL.
function pickFour(
  envVal: string | undefined,
  envSrc: ConfigSource,
  overlayVal: string | undefined,
  overlaySrc: ConfigSource,
  userVal: string | undefined,
  userSrc: ConfigSource,
  fallback: string,
): Picked<string> {
  if (envVal !== undefined) return { value: envVal, source: envSrc };
  if (overlayVal !== undefined) return { value: overlayVal, source: overlaySrc };
  if (userVal !== undefined) return { value: userVal, source: userSrc };
  return { value: fallback, source: "default" };
}

// Two-layer pick for optional fields with no built-in default (baseURL).
// Returns undefined when neither layer set the value.
function pickOptional(
  envVal: string | undefined,
  envSrc: ConfigSource,
  userVal: string | undefined,
  userSrc: ConfigSource,
): Picked<string> | undefined {
  if (envVal !== undefined) return { value: envVal, source: envSrc };
  if (userVal !== undefined) return { value: userVal, source: userSrc };
  return undefined;
}

function parseUserConfig(
  raw: string | undefined,
  path: string,
  warn: (msg: string) => void,
): z.infer<typeof userConfigSchema> {
  if (raw === undefined) return {};
  let parsed: unknown;
  try {
    parsed = TOML.parse(raw);
  } catch (err) {
    warn(`failed to parse ${path}: ${(err as Error).message}`);
    return {};
  }
  const result = userConfigSchema.safeParse(parsed);
  if (!result.success) {
    warn(`invalid config at ${path}: ${result.error.message}`);
    return {};
  }
  // Drop empty / whitespace-only string fields so they don't shadow defaults.
  // `api_key = ""` in the user TOML would otherwise mark source="user" and
  // skip the wizard with a blank key in hand. (F1.2)
  // F5 P1: also trim leading/trailing whitespace on non-empty strings so a
  // copy-paste artifact like `api_key = "  sk-real  "` doesn't fail upstream
  // auth. The TOML grammar preserves whitespace inside quotes; users
  // copy-pasting from terminals frequently include surrounding spaces.
  const cleaned: z.infer<typeof userConfigSchema> = {};
  for (const [k, v] of Object.entries(result.data)) {
    if (typeof v === "string") {
      const trimmed = v.trim();
      if (trimmed === "") continue;
      (cleaned as Record<string, unknown>)[k] = trimmed;
      continue;
    }
    (cleaned as Record<string, unknown>)[k] = v;
  }
  return cleaned;
}

function parseOverlayConfig(
  raw: string | undefined,
  warn: (msg: string) => void,
): z.infer<typeof overlayConfigSchema> {
  if (raw === undefined) return {};
  let parsed: Record<string, unknown>;
  try {
    parsed = TOML.parse(raw) as Record<string, unknown>;
  } catch (err) {
    warn(`failed to parse project overlay: ${(err as Error).message}`);
    return {};
  }
  for (const blocked of PROJECT_OVERLAY_BLOCKED) {
    if (blocked in parsed) {
      warn(`project overlay cannot set "${blocked}" — ignored`);
      delete parsed[blocked];
    }
  }
  const result = overlayConfigSchema.safeParse(parsed);
  if (!result.success) {
    warn(`invalid project overlay: ${result.error.message}`);
    return {};
  }
  const model = result.data.model?.trim();
  return model ? { model } : {};
}
