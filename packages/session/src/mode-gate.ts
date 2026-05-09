// Mode-gate filter (G2.5).
//
// Pure function. Plan mode strips out any tool whose `permission` is
// "deny-in-plan" — typically file-mutating or process-launching tools that
// would break the read-only "plan" stance. Agent and YOLO modes pass every
// registered tool through unchanged; the gating between Agent (ask before
// running) and YOLO (auto-approve) lives one layer up in the caller's
// approval flow, not here.
//
// Returns a fresh Map so downstream mutations on the original registry don't
// leak across mode boundaries — callers wire the result straight into
// `runSession({ tools })`.

import type { AnyTool, ToolMode } from "@openseek/tool";

export function filterToolsByMode(
  tools: Map<string, AnyTool>,
  mode: ToolMode,
): Map<string, AnyTool> {
  if (mode !== "plan") return new Map(tools);
  const out = new Map<string, AnyTool>();
  for (const [name, t] of tools) {
    if (t.permission !== "deny-in-plan") out.set(name, t);
  }
  return out;
}
