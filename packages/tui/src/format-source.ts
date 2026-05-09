// Status-bar source tag (Phase 3).
//
// Tells the user where the active config came from. Loudest-signal wins:
//
//   1. ANY field from env       → " (env)"
//   2. else ANY field default   → " (default)"     (not fully configured)
//   3. else ANY field project   → " (project)"
//   4. else (all fields user)   → " (config)"
//   5. else                     → ""               (unreachable in practice)
//
// Returns a leading-space string so the caller can do `${model}${tag}`
// without conditional formatting.

import type { ConfigSources } from "@openseek/provider";

export function formatSourceTag(s: ConfigSources): string {
  const fields = [s.provider, s.model, s.apiKey, s.baseURL].filter(
    (f): f is NonNullable<typeof f> => f !== undefined,
  );

  if (fields.includes("env")) return " (env)";
  if (fields.includes("default")) return " (default)";
  if (fields.includes("project")) return " (project)";
  if (fields.every((f) => f === "user")) return " (config)";
  return "";
}
