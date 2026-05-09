#!/usr/bin/env bun
// Build the openseek CLI bundle.
//
// Why a script (vs. plain `bun build`): we need to register
// @opentui/solid's bun plugin during bundling so that
//   1. .tsx files are transformed by babel-preset-solid (universal generate,
//      moduleName: "@opentui/solid"), and
//   2. solid-js/dist/server.js gets rewritten to solid-js/dist/solid.js —
//      otherwise bun resolves the "node" export condition and bakes the SSR
//      stubs into the bundle, which makes the TUI crash inside createMemo.
//
// `bun build` (the CLI) doesn't accept --plugin flags, so the plugin must be
// applied via the JS API.

import solidPlugin from "@opentui/solid/bun-plugin";

const result = await Bun.build({
  entrypoints: ["packages/cli/src/index.ts"],
  outdir: "dist",
  target: "bun",
  minify: true,
  // solid-js MUST be external. @opentui/* is also external, and @opentui/solid
  // creates its RendererContext using its own runtime copy of solid-js. If we
  // bundle solid-js, source files like interactive.ts get a *second* solid-js
  // instance and createSignal/useContext from the bundle no longer share state
  // with the renderer — components throw "No renderer found" on first effect.
  external: ["@opentui/*", "solid-js", "solid-js/*", "node:*"],
  plugins: [solidPlugin],
});

if (!result.success) {
  for (const log of result.logs) console.error(log);
  process.exit(1);
}

for (const out of result.outputs) {
  console.log(`[build] ${out.path} (${(out.size / 1024).toFixed(1)} KB)`);
}
