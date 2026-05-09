// Loader scans node_modules/ for `openseek-plugin-*` packages and invokes
// their `register(api)` hook. We resolve packages by name, accept either a
// default export OR a named `plugin` export, and isolate failures so one
// broken plugin doesn't take down the registry.

import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join, sep } from "node:path";
import type { LoadResult, Plugin, PluginApi, PluginCommandLike, PluginToolLike } from "./types.ts";

export interface LoadPluginsOptions {
  /** node_modules roots to scan. Default: <cwd>/node_modules. */
  dirs?: string[];
  /** Already-loaded Plugin instances (skip filesystem scan). */
  inline?: Plugin[];
  /** Resolver override for tests / non-Node environments. */
  importer?: (specifier: string) => Promise<unknown>;
}

const PREFIX = "openseek-plugin-";

export async function loadPlugins(opts: LoadPluginsOptions = {}): Promise<LoadResult> {
  const result: LoadResult = { plugins: [], tools: [], commands: [], warnings: [] };
  const api: PluginApi = {
    addTool: (t) => result.tools.push(t),
    addCommand: (c) => result.commands.push(c),
  };

  // 1. Inline plugins (used in tests + first-party bundle).
  for (const plugin of opts.inline ?? []) {
    await runRegister(plugin, api, result);
  }

  // 2. node_modules scan — skip when no dirs supplied.
  if (opts.dirs && opts.dirs.length > 0) {
    const importer = opts.importer ?? defaultImporter;
    for (const dir of opts.dirs) {
      if (!existsSync(dir)) continue;
      let entries: string[] = [];
      try {
        entries = readdirSync(dir);
      } catch (err) {
        result.warnings.push({ source: dir, message: errMsg(err) });
        continue;
      }
      for (const entry of entries) {
        if (!entry.startsWith(PREFIX)) continue;
        const pkgDir = join(dir, entry);
        const pkgJson = join(pkgDir, "package.json");
        if (!existsSync(pkgJson)) continue;
        try {
          const spec = pluginSpecifier(pkgDir, dir);
          const mod = (await importer(spec)) as Record<string, unknown>;
          const plugin = (mod.default ?? mod.plugin) as Plugin | undefined;
          if (!plugin || typeof plugin.register !== "function") {
            result.warnings.push({ source: entry, message: "no default/plugin export with register()" });
            continue;
          }
          // Fall back to package.json name/version if the plugin omits them.
          const meta = JSON.parse(readFileSync(pkgJson, "utf8"));
          const fixed: Plugin = {
            name: plugin.name ?? meta.name ?? entry,
            version: plugin.version ?? meta.version ?? "0.0.0",
            register: plugin.register,
          };
          await runRegister(fixed, api, result);
        } catch (err) {
          result.warnings.push({ source: entry, message: errMsg(err) });
        }
      }
    }
  }
  return result;
}

async function runRegister(plugin: Plugin, api: PluginApi, result: LoadResult): Promise<void> {
  try {
    await plugin.register(api);
    result.plugins.push(plugin);
  } catch (err) {
    result.warnings.push({ source: plugin.name, message: errMsg(err) });
  }
}

function pluginSpecifier(pkgDir: string, modulesDir: string): string {
  // Use absolute path import for deterministic resolution under tests.
  const rel = pkgDir.slice(modulesDir.length).split(sep).filter(Boolean).join("/");
  return rel ? rel : pkgDir;
}

const defaultImporter = (spec: string) => import(spec);

function errMsg(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

/** Convenience: extend an existing tool list + command list with loaded items. */
export function applyLoaded(
  tools: PluginToolLike[],
  commands: PluginCommandLike[],
  loaded: LoadResult,
): { tools: PluginToolLike[]; commands: PluginCommandLike[] } {
  return {
    tools: [...tools, ...loaded.tools],
    commands: [...commands, ...loaded.commands],
  };
}
