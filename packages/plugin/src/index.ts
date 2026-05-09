// @openseek/plugin — third-party tool/command extension protocol.
// SPEC.md milestone v0.4 G4.4.

export const PACKAGE_NAME = "@openseek/plugin";

export type {
  LoadResult,
  Plugin,
  PluginApi,
  PluginCommandLike,
  PluginToolLike,
} from "./types.ts";
export type { LoadPluginsOptions } from "./loader.ts";
export { applyLoaded, loadPlugins } from "./loader.ts";
