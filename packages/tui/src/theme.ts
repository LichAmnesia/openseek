// Reactive TUI theme registry.
//
// Pre-refactor `defaultTheme` was a frozen const; consumers wrote
// `<text fg={defaultTheme.user}>...` — the value baked at compile time and
// no slash command could change it.
//
// Post-refactor we keep the SAME `.X` access syntax for callers but back
// every read with a Solid signal. The active theme name lives in
// `themeNameSignal`; reading any property from the exported `defaultTheme`
// Proxy proxies to `THEMES[active].<key>`. Because Solid wraps JSX
// attribute expressions in a tracking computation, every `<text fg={...}>`
// becomes reactive automatically — no consumer had to change.
//
// Mikan-orange splash + restrained tones for the live transcript so the
// thinking-block (gray+italic, G1.4) reads as obviously secondary against
// the white assistant answer.

import { createSignal } from "solid-js";

import type { TuiTheme } from "./types.ts";

export type ThemeName = "default" | "dark" | "light" | "high-contrast";

/** Default theme — same hex values that lived in the pre-refactor const. */
const DEFAULT: TuiTheme = {
  user: "#60a5fa", // tailwind blue-400
  assistant: "#fafafa", // near-white
  thinking: "#6b7280", // tailwind gray-500
  tool: "#a78bfa", // tailwind violet-400
  error: "#f87171", // tailwind red-400
  system: "#9ca3af", // tailwind gray-400
  dim: "#64748b", // tailwind slate-500
  splash: "#fb923c", // tailwind orange-400 — mikan accent
};

/**
 * Dark — deeper background contrast: brighter primary text + saturated
 * accents. Visibly different `user` / `assistant` so theme switch tests can
 * assert a real change.
 */
const DARK: TuiTheme = {
  user: "#38bdf8", // sky-400 (cooler blue)
  assistant: "#ffffff",
  thinking: "#94a3b8", // slate-400
  tool: "#c084fc", // purple-400
  error: "#fca5a5", // red-300
  system: "#cbd5e1", // slate-300
  dim: "#475569", // slate-600
  splash: "#fb923c",
};

/**
 * Light — designed for terminals with light backgrounds. Foregrounds drop
 * to dark hex so they're readable on white.
 */
const LIGHT: TuiTheme = {
  user: "#1d4ed8", // blue-700
  assistant: "#0f172a", // slate-900
  thinking: "#475569", // slate-600
  tool: "#7c3aed", // violet-600
  error: "#b91c1c", // red-700
  system: "#334155", // slate-700
  dim: "#94a3b8", // slate-400
  splash: "#c2410c", // orange-700
};

/**
 * High contrast — accessibility / low-vision profile. Pure black/white +
 * strong primaries.
 */
const HIGH_CONTRAST: TuiTheme = {
  user: "#00ffff", // cyan
  assistant: "#ffffff",
  thinking: "#bfbfbf",
  tool: "#ff00ff", // magenta
  error: "#ff0000",
  system: "#ffff00", // yellow
  dim: "#bfbfbf",
  splash: "#ffaa00",
};

export const THEMES: Record<ThemeName, TuiTheme> = {
  default: DEFAULT,
  dark: DARK,
  light: LIGHT,
  "high-contrast": HIGH_CONTRAST,
};

export const THEME_NAMES = Object.keys(THEMES) as ThemeName[];

const [themeName, setThemeNameSignal] = createSignal<ThemeName>("default");

/** Read the active theme name. Reactive. */
export function currentThemeName(): ThemeName {
  return themeName();
}

/** Read the active theme object. Reactive. */
export function currentTheme(): TuiTheme {
  return THEMES[themeName()];
}

/**
 * Switch theme. Unknown names are ignored (the command handler enforces the
 * whitelist; this is a defensive guard for direct callers).
 */
export function setCurrentTheme(name: string): void {
  if ((THEME_NAMES as readonly string[]).includes(name)) {
    setThemeNameSignal(name as ThemeName);
  }
}

/**
 * Reactive theme proxy used by every `<text fg={defaultTheme.user}>` in
 * the codebase. The Proxy's `get` handler reads from the live signal, so
 * Solid's JSX-attribute tracking computation re-runs when the user fires
 * `/theme dark` and the colors flip in place.
 *
 * IMPORTANT: this proxy only reacts when accessed inside a tracking scope
 * (JSX attribute, createMemo, createEffect). A bare `console.log(defaultTheme.user)`
 * outside any reactive scope will return the current value but won't
 * re-fire when the theme changes — exactly the same semantics as `theme().user`.
 */
export const defaultTheme: TuiTheme = new Proxy({} as TuiTheme, {
  get(_target, prop): string | undefined {
    if (typeof prop !== "string") return undefined;
    const t = currentTheme();
    return (t as unknown as Record<string, string>)[prop];
  },
  // Theme is read-only from consumers; setters are a no-op.
  set(): boolean {
    return true;
  },
  has(_target, prop): boolean {
    return typeof prop === "string" && prop in currentTheme();
  },
  ownKeys(): string[] {
    return Object.keys(currentTheme());
  },
  getOwnPropertyDescriptor(_target, prop) {
    if (typeof prop !== "string") return undefined;
    const t = currentTheme();
    if (!(prop in t)) return undefined;
    return {
      enumerable: true,
      configurable: true,
      value: (t as unknown as Record<string, string>)[prop],
    };
  },
});

/** Required keys — used by tests + a structural invariant. */
export const themeKeys = [
  "user",
  "assistant",
  "thinking",
  "tool",
  "error",
  "system",
  "dim",
  "splash",
] as const satisfies readonly (keyof TuiTheme)[];
