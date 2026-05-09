/** @jsxImportSource @opentui/solid */
// Boot the TUI renderer + mount <App>. Returns a `destroy` handle so the
// owner (cli) can tear down on Ctrl+C-#2 / Ctrl+D / process exit.
//
// `exitOnCtrlC: false` is critical: we route Ctrl+C through useKeyboard so
// the first press cancels the in-flight stream rather than killing the
// process. The cli-layer typically wires `actions.onExit` to call this
// returned `destroy`.

import { createCliRenderer, type CliRenderer } from "@opentui/core";
import { render } from "@opentui/solid";
import { App } from "./App.tsx";
import type { MountOptions } from "./types.ts";

export interface MountHandle {
  /** Underlying renderer, exposed for advanced callers (focus mgmt, etc). */
  renderer: CliRenderer;
  /** Tear down the renderer cleanly. Idempotent. */
  destroy: () => Promise<void>;
}

export async function mountTui(opts: MountOptions): Promise<MountHandle> {
  const renderer = await createCliRenderer({
    exitOnCtrlC: false, // we handle Ctrl+C ourselves (G1.6 cancel-vs-exit).
    targetFps: 60,
    // Mouse on so the transcript ScrollBox honors wheel scroll. opentui
    // routes wheel events to the renderable under the cursor; ScrollBox's
    // onMouseEvent does the right thing with `_hasManualScroll` already.
    useMouse: true,
    // CRITICAL: opentui defaults autoFocus to TRUE — every left-click walks
    // up the renderable tree and focuses the first `focusable` ancestor.
    // ScrollBoxRenderable._focusable is true, so a single click anywhere in
    // the transcript (including text-selection drags) steals focus from the
    // composer Input — and Composer's `focused={true}` prop is a static
    // boolean, so Solid never re-applies it on re-render. Result: the user
    // clicks the transcript to read /skills (or any other long output) and
    // the composer silently goes deaf to all keystrokes until restart.
    //
    // Our app has exactly ONE always-focused Input; click-to-focus is dead
    // weight. Wheel scroll is routed by cursor position regardless of
    // focus, so disabling autoFocus does not break scrolling.
    autoFocus: false,
  });

  await render(
    () => (
      <App
        state={opts.state}
        actions={opts.actions}
        provider={opts.provider}
        model={opts.model}
        mode={opts.mode}
      />
    ),
    renderer,
  );

  let destroyed = false;
  return {
    renderer,
    async destroy() {
      if (destroyed) return;
      destroyed = true;
      // CliRenderer.destroy is sync in current opentui; await covers future shape.
      await Promise.resolve(renderer.destroy());
    },
  };
}
