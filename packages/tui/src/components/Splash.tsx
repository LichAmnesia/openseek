/** @jsxImportSource @opentui/solid */
// Splash banner shown for the first ~0.8s of every session.
// Hand-drawn ASCII (no `ascii_font` dependency) so it renders identically
// on terminals that lack figlet fonts.

import type { JSX } from "solid-js";
import { defaultTheme } from "../theme.ts";

const BANNER = [
  "  ___                  ____            _    ",
  " / _ \\ _ __  ___ _ __ / ___|  ___  ___| | __",
  "| | | | '_ \\/ _ \\ '_ \\\\___ \\ / _ \\/ _ \\ |/ /",
  "| |_| | |_) |  __/ | | |___) |  __/  __/   < ",
  " \\___/| .__/\\___|_| |_|____/ \\___|\\___|_|\\_\\",
  "      |_|                                    ",
] as const;

export interface SplashProps {
  provider: string;
  model: string;
}

export function Splash(props: SplashProps): JSX.Element {
  return (
    <box flexDirection="column" paddingX={2} paddingY={1}>
      {BANNER.map((line) => (
        <text fg={defaultTheme.splash}>{line}</text>
      ))}
      <text fg={defaultTheme.dim}>open-source TUI coding agent</text>
      <text fg={defaultTheme.system}>
        {props.provider} · {props.model}
      </text>
    </box>
  );
}
