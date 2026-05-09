// First-run setup gate (Phase 2).
//
// Decides whether the onboarding wizard should run. Pure function so the
// test suite can drive the decision without spinning up the TUI renderer.
//
// Rule:
//   first-run  := provider requires an api key AND config.source.apiKey === "default"
//   eligible   := isTTY === true
//                 AND args.prompt === undefined          (not one-shot)
//                 AND args.subcommand !== "serve"        (not the API server)
//                 AND args.noSetup !== true              (--no-setup escape)
//                 AND args.version !== true && args.help !== true

import { getProvider, type ResolvedConfig } from "@openseek/provider";
import type { ParsedArgv } from "./argv.ts";
import { providerRequiresApiKey } from "./provider-auth.ts";

export interface SetupGateInput {
  config: Pick<ResolvedConfig, "provider" | "source">;
  args: Pick<ParsedArgv, "prompt" | "subcommand" | "noSetup" | "version" | "help">;
  isTTY: boolean;
}

export function shouldRunSetup(input: SetupGateInput): boolean {
  if (input.args.version || input.args.help) return false;
  if (input.args.noSetup) return false;
  if (input.args.subcommand === "serve") return false;
  if (input.args.prompt !== undefined) return false;
  if (!input.isTTY) return false;
  const provider = getProvider(input.config.provider);
  if (provider && !providerRequiresApiKey(provider)) return false;
  return input.config.source.apiKey === "default";
}
