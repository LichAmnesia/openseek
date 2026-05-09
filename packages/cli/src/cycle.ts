// Cycle helpers for Tab / Shift+Tab toggles (G2.5 + G2.6).
//
// Pure: take the current value, return the next one in the documented
// rotation. Lives in the CLI package (not session) because it expresses a
// keyboard-binding policy, not a runtime contract.

import type { ToolMode } from "@openseek/tool";
import type { ReasoningEffort } from "@openseek/session";

const MODE_ORDER: ToolMode[] = ["plan", "agent", "yolo"];
const EFFORT_ORDER: ReasoningEffort[] = ["off", "high", "max"];

export function cycleMode(current: ToolMode): ToolMode {
  const i = MODE_ORDER.indexOf(current);
  const next = MODE_ORDER[(i + 1) % MODE_ORDER.length];
  // i = -1 → bogus input, fall back to plan; otherwise next is non-undefined.
  return next ?? "plan";
}

export function cycleEffort(current: ReasoningEffort): ReasoningEffort {
  const i = EFFORT_ORDER.indexOf(current);
  const next = EFFORT_ORDER[(i + 1) % EFFORT_ORDER.length];
  return next ?? "off";
}
