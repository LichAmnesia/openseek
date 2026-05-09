// Settings sync against mikan-cloud (G6.5).
//
// v0.6 ships the client only — the server endpoint lives in mikan-cloud
// (planned v0.7). We still write a local cache so a reboot can rehydrate
// settings even when offline. `fetch` is injected for tests.
//
// Layout:
//   ~/.openseek/sync-cache.json
//   {
//     "syncedAt": "2026-05-04T12:00:00Z",
//     "settings": { ... user payload ... }
//   }

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import { timeoutSignal } from "./fetch-timeout.ts";

export interface SyncSettings {
  [key: string]: unknown;
}

export interface SyncResult {
  ok: boolean;
  /** Server-returned settings, or local-cache fallback. */
  settings: SyncSettings;
  /** Whether the result came from server (true) or local cache (false). */
  fromServer: boolean;
}

export interface SyncClientOpts {
  apiKey: string;
  baseURL?: string;
  fetch?: typeof fetch;
  timeoutMs?: number;
  /** Override cache path (tests use tmp dirs). */
  cachePath?: string;
}

const DEFAULT_BASE = "https://api.mikancloud.com/v1";

export function defaultCachePath(): string {
  return join(homedir(), ".openseek", "sync-cache.json");
}

export async function syncSettings(
  settings: SyncSettings,
  opts: SyncClientOpts,
): Promise<SyncResult> {
  const f = opts.fetch ?? globalThis.fetch;
  const base = (opts.baseURL ?? DEFAULT_BASE).replace(/\/$/, "");
  const cachePath = opts.cachePath ?? defaultCachePath();

  if (opts.apiKey) {
    try {
      const res = await f(`${base}/settings/sync`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${opts.apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ settings }),
        signal: timeoutSignal(opts.timeoutMs),
      });
      if (res.ok) {
        const body = (await res.json()) as { settings?: SyncSettings };
        const merged = body.settings ?? settings;
        writeCache(cachePath, merged);
        return { ok: true, settings: merged, fromServer: true };
      }
    } catch {
      // fall through to cache
    }
  }

  const cached = readCache(cachePath);
  if (cached) return { ok: false, settings: cached, fromServer: false };
  return { ok: false, settings, fromServer: false };
}

function writeCache(path: string, settings: SyncSettings): void {
  try {
    mkdirSync(dirname(path), { recursive: true });
    const payload = { syncedAt: new Date().toISOString(), settings };
    writeFileSync(path, JSON.stringify(payload, null, 2), "utf8");
  } catch {
    // best-effort
  }
}

function readCache(path: string): SyncSettings | null {
  if (!existsSync(path)) return null;
  try {
    const raw = readFileSync(path, "utf8");
    const parsed = JSON.parse(raw) as { settings?: SyncSettings };
    if (parsed && typeof parsed.settings === "object" && parsed.settings) return parsed.settings;
    return null;
  } catch {
    return null;
  }
}
