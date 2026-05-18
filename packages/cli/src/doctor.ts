// `openseek doctor` — print resolved config + per-field origin layer.
//
// Surfaces the precedence chain documented in @openseek/provider's
// config.ts (env > project > user > default) so users can see exactly
// where each value came from when troubleshooting.

import { loadConfig, type ConfigSource } from "@openseek/provider";
import type { RunResult } from "./index.ts";

const SOURCE_LABEL: Record<ConfigSource, string> = {
  env: "env",
  project: "project (.openseek/config.toml)",
  user: "user (~/.openseek/config.toml)",
  default: "built-in default",
};

function maskApiKey(apiKey: string): string {
  if (apiKey === "") return "(unset)";
  if (apiKey.length <= 8) return "***";
  return `${apiKey.slice(0, 4)}…${apiKey.slice(-4)}`;
}

function line(label: string, value: string, source: ConfigSource): string {
  return `  ${label.padEnd(10)} ${value.padEnd(30)} ← ${SOURCE_LABEL[source]}`;
}

export function runDoctor(
  workspace: string = process.cwd(),
  ioOverride?: Parameters<typeof loadConfig>[1],
): RunResult {
  const config = loadConfig(workspace, ioOverride);
  console.log("openseek doctor");
  console.log("");
  console.log("Resolved configuration:");
  console.log(line("provider", config.provider, config.source.provider));
  console.log(line("model", config.model, config.source.model));
  console.log(line("api_key", maskApiKey(config.apiKey), config.source.apiKey));
  if (config.baseURL !== undefined) {
    console.log(line("base_url", config.baseURL, config.source.baseURL ?? "default"));
  } else {
    console.log(`  ${"base_url".padEnd(10)} ${"(provider default)".padEnd(30)} ← built-in default`);
  }
  console.log("");
  console.log("Precedence (highest first):");
  console.log("  1. env       OPENSEEK_PROVIDER / OPENSEEK_MODEL / OPENSEEK_API_KEY / OPENSEEK_BASE_URL");
  console.log("  2. project   <workspace>/.openseek/config.toml  (model only — secrets ignored)");
  console.log("  3. user      ~/.openseek/config.toml");
  console.log("  4. default   built-in fallbacks");
  return { exitCode: 0 };
}
