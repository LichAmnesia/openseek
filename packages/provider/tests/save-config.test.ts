// Phase 2 — saveUserConfig persistence helper.
//
// Tests use ioOverride to keep the developer's real ~/.openseek untouched.
// One test exercises real fs against a tmpdir to verify the 0600 mode.

import { afterEach, beforeEach, expect, test } from "bun:test";
import {
  chmodSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import * as TOML from "@iarna/toml";
import { loadConfig } from "../src/config.ts";
import { saveUserConfig } from "../src/save-config.ts";

let home: string;

beforeEach(() => {
  home = mkdtempSync(join(tmpdir(), "openseek-save-"));
});

afterEach(() => {
  rmSync(home, { recursive: true, force: true });
});

test("writes new file with TOML keys provider/model/api_key/base_url", () => {
  const writes: { path: string; contents: string; mode: number }[] = [];
  const mkdirCalls: string[] = [];
  const path = saveUserConfig(
    {
      provider: "mikan",
      model: "deepseek-v4-flash",
      apiKey: "sk-test",
      baseURL: "https://api.mikancloud.com/v1",
    },
    {
      home: "/fake/home",
      readFile: () => undefined,
      mkdir: (p) => {
        mkdirCalls.push(p);
      },
      writeFile: (p, c, mode) => {
        writes.push({ path: p, contents: c, mode });
      },
      exists: () => false,
    },
  );
  expect(path).toBe("/fake/home/.openseek/config.toml");
  expect(mkdirCalls).toEqual(["/fake/home/.openseek"]);
  expect(writes).toHaveLength(1);
  const w = writes[0];
  if (!w) throw new Error("expected one write");
  expect(w.mode).toBe(0o600);

  const parsed = TOML.parse(w.contents) as Record<string, unknown>;
  expect(parsed.provider).toBe("mikan");
  expect(parsed.model).toBe("deepseek-v4-flash");
  expect(parsed.api_key).toBe("sk-test");
  expect(parsed.base_url).toBe("https://api.mikancloud.com/v1");
});

test("merges over existing file without nuking unrelated keys", () => {
  const existing = `provider = "openai"
model = "gpt-4o"
api_key = "sk-old"
some_future_key = "preserved"
`;
  const writes: { path: string; contents: string; mode: number }[] = [];
  saveUserConfig(
    { apiKey: "sk-NEW" },
    {
      home: "/fake/home",
      readFile: () => existing,
      mkdir: () => {},
      writeFile: (p, c, mode) => {
        writes.push({ path: p, contents: c, mode });
      },
      exists: () => true,
    },
  );
  const w0 = writes[0];
  if (!w0) throw new Error("expected one write");
  const parsed = TOML.parse(w0.contents) as Record<string, unknown>;
  expect(parsed.api_key).toBe("sk-NEW");
  expect(parsed.provider).toBe("openai"); // not nuked
  expect(parsed.model).toBe("gpt-4o");
  expect(parsed.some_future_key).toBe("preserved");
});

test("baseURL null removes stale base_url while preserving unrelated keys", () => {
  const existing = `provider = "custom"
model = "custom-model"
base_url = "http://old.example/v1"
some_future_key = "preserved"
`;
  const writes: { contents: string }[] = [];
  saveUserConfig(
    { provider: "openai", model: "gpt-4o", baseURL: null },
    {
      home: "/fake/home",
      readFile: () => existing,
      mkdir: () => {},
      writeFile: (_p, c) => {
        writes.push({ contents: c });
      },
      exists: () => true,
    },
  );
  const w0 = writes[0];
  if (!w0) throw new Error("expected one write");
  const parsed = TOML.parse(w0.contents) as Record<string, unknown>;
  expect(parsed.provider).toBe("openai");
  expect(parsed.model).toBe("gpt-4o");
  expect("base_url" in parsed).toBe(false);
  expect(parsed.some_future_key).toBe("preserved");
});

test("mkdir is called when ~/.openseek/ doesn't exist (always — mkdir -p)", () => {
  const mkdirs: string[] = [];
  saveUserConfig(
    { provider: "mikan" },
    {
      home: "/fake/home",
      readFile: () => undefined,
      mkdir: (p) => {
        mkdirs.push(p);
      },
      writeFile: () => {},
      exists: () => false,
    },
  );
  expect(mkdirs).toEqual(["/fake/home/.openseek"]);
});

test("real fs round-trip: 0600 mode + loadConfig reads what we wrote", () => {
  const path = saveUserConfig(
    {
      provider: "openai",
      model: "gpt-4o",
      apiKey: "sk-roundtrip",
      baseURL: "https://example.com/v1",
    },
    { home },
  );
  // Mode mask is 0o777 to drop the file-type bits.
  const mode = statSync(path).mode & 0o777;
  expect(mode).toBe(0o600);

  const cfg = loadConfig(undefined, { home, env: {}, warn: () => {} });
  expect(cfg.provider).toBe("openai");
  expect(cfg.model).toBe("gpt-4o");
  expect(cfg.apiKey).toBe("sk-roundtrip");
  expect(cfg.baseURL).toBe("https://example.com/v1");
  expect(cfg.source.apiKey).toBe("user");
});

test("malformed existing TOML is replaced rather than thrown", () => {
  const writes: string[] = [];
  saveUserConfig(
    { provider: "mikan" },
    {
      home: "/fake/home",
      readFile: () => "this is = not [valid toml",
      mkdir: () => {},
      writeFile: (_p, c) => {
        writes.push(c);
      },
      exists: () => true,
    },
  );
  const w0 = writes[0];
  if (!w0) throw new Error("expected one write");
  const parsed = TOML.parse(w0) as Record<string, unknown>;
  expect(parsed.provider).toBe("mikan");
});

// F1.4: an existing 0o644 config file must be tightened to 0o600 after save.
test("force-tightens existing file mode to 0600 (atomic rename + chmod)", () => {
  const dir = join(home, ".openseek");
  mkdirSync(dir, { recursive: true });
  const target = join(dir, "config.toml");
  writeFileSync(target, `provider = "openai"\n`);
  chmodSync(target, 0o644);
  const before = statSync(target).mode & 0o777;
  expect(before).toBe(0o644);

  saveUserConfig({ provider: "mikan", apiKey: "sk-tightened" }, { home });

  const after = statSync(target).mode & 0o777;
  expect(after).toBe(0o600);
  // Real key must have been preserved across the merge.
  const cfg = loadConfig(undefined, { home, env: {}, warn: () => {} });
  expect(cfg.apiKey).toBe("sk-tightened");
});

// F1.4: pre-existing 0o755 directory must be tightened to 0o700.
test("force-tightens existing directory mode to 0700", () => {
  const dir = join(home, ".openseek");
  mkdirSync(dir, { recursive: true, mode: 0o755 });
  chmodSync(dir, 0o755);
  const before = statSync(dir).mode & 0o777;
  expect(before).toBe(0o755);

  saveUserConfig({ provider: "mikan" }, { home });

  const after = statSync(dir).mode & 0o777;
  expect(after).toBe(0o700);
});

// F1.3: when the atomic write fails mid-flight, the original target is
// untouched and the temp file is cleaned up.
test("crash mid-write leaves original file intact (atomic temp-then-rename)", () => {
  const dir = join(home, ".openseek");
  mkdirSync(dir, { recursive: true });
  const target = join(dir, "config.toml");
  const original = `provider = "openai"\nmodel = "gpt-4o"\napi_key = "sk-original"\n`;
  writeFileSync(target, original, { mode: 0o600 });

  // Inject a writeFile override that simulates a crash before the rename
  // would have happened. We call a manual atomic helper that mimics the
  // production path so we can assert the contract; the production code
  // catches errors and unlinks the temp file but rethrows.
  let threw = false;
  try {
    saveUserConfig(
      { provider: "mikan", apiKey: "sk-NEW" },
      {
        home,
        // simulate failure deep inside the write phase
        writeFile: () => {
          throw new Error("disk full");
        },
      },
    );
  } catch (e) {
    threw = true;
    expect((e as Error).message).toBe("disk full");
  }
  expect(threw).toBe(true);
  // Original file is intact — a half-written TOML never ended up at target.
  const onDisk = readFileSync(target, "utf8");
  expect(onDisk).toBe(original);
  // No leftover .config.toml.tmp.* siblings.
  const stragglers = readdirSync(dir).filter((n) => /^\.config\.toml\.tmp\./.test(n));
  expect(stragglers).toEqual([]);
});

// F1.3: fresh atomic write on a tmpdir leaves no temp files behind.
test("atomic write cleans up after itself (no .tmp siblings)", () => {
  saveUserConfig({ provider: "mikan", apiKey: "sk-clean" }, { home });
  const dir = join(home, ".openseek");
  const stragglers = readdirSync(dir).filter((n) => /^\.config\.toml\.tmp\./.test(n));
  expect(stragglers).toEqual([]);
});

// F5 P0-GAP #4: atomic write must fsync the PARENT DIRECTORY after rename
// so the new dirent survives a hard crash. We monkey-patch fs.openSync +
// fs.fsyncSync to record which fds got fsync'd and verify the parent dir
// fd was among them.
test("F5 P0-GAP #4: atomic write fsyncs the parent directory fd after rename", () => {
  const fs = require("node:fs") as typeof import("node:fs");
  const origOpenSync = fs.openSync;
  const origFsyncSync = fs.fsyncSync;
  // Track fd → path so we can identify which fd was the parent directory.
  const fdToPath = new Map<number, string>();
  const fsyncedPaths: string[] = [];
  // biome-ignore lint/suspicious/noExplicitAny: monkey-patch boundary.
  (fs as any).openSync = function (path: string, flags: string | number, mode?: number): number {
    const fd = origOpenSync.call(this, path, flags as never, mode as never);
    fdToPath.set(fd, String(path));
    return fd;
  };
  // biome-ignore lint/suspicious/noExplicitAny: monkey-patch boundary.
  (fs as any).fsyncSync = function (fd: number): void {
    const p = fdToPath.get(fd);
    if (p !== undefined) fsyncedPaths.push(p);
    origFsyncSync.call(this, fd);
  };
  try {
    saveUserConfig({ provider: "mikan", apiKey: "sk-fsync-test" }, { home });
    // The parent dir of config.toml is `<home>/.openseek` — assert it was
    // among the paths that received fsync after the rename.
    const parentDir = join(home, ".openseek");
    expect(fsyncedPaths).toContain(parentDir);
  } finally {
    // biome-ignore lint/suspicious/noExplicitAny: restore originals.
    (fs as any).openSync = origOpenSync;
    // biome-ignore lint/suspicious/noExplicitAny: restore originals.
    (fs as any).fsyncSync = origFsyncSync;
  }
});

// F5 P0-GAP #4: directory fsync failure must be swallowed (best-effort).
test("F5 P0-GAP #4: directory-fsync failure does NOT throw — best-effort", () => {
  const fs = require("node:fs") as typeof import("node:fs");
  const origOpenSync = fs.openSync;
  const origFsyncSync = fs.fsyncSync;
  // Track which fds correspond to directories so we can fail fsync only on those.
  const dirFds = new Set<number>();
  // biome-ignore lint/suspicious/noExplicitAny: monkey-patch boundary.
  (fs as any).openSync = function (path: string, flags: string | number, mode?: number): number {
    const fd = origOpenSync.call(this, path, flags as never, mode as never);
    try {
      const st = fs.fstatSync(fd);
      if (st.isDirectory()) dirFds.add(fd);
    } catch {
      // ignore
    }
    return fd;
  };
  // biome-ignore lint/suspicious/noExplicitAny: monkey-patch boundary.
  (fs as any).fsyncSync = function (fd: number): void {
    if (dirFds.has(fd)) {
      throw new Error("EINVAL — directory fsync unsupported");
    }
    origFsyncSync.call(this, fd);
  };
  try {
    expect(() =>
      saveUserConfig({ provider: "mikan", apiKey: "sk-no-dir-fsync" }, { home }),
    ).not.toThrow();
    // File still landed on disk.
    const parsed = TOML.parse(
      readFileSync(join(home, ".openseek", "config.toml"), "utf8"),
    ) as Record<string, unknown>;
    expect(parsed.api_key).toBe("sk-no-dir-fsync");
  } finally {
    // biome-ignore lint/suspicious/noExplicitAny: restore originals.
    (fs as any).openSync = origOpenSync;
    // biome-ignore lint/suspicious/noExplicitAny: restore originals.
    (fs as any).fsyncSync = origFsyncSync;
  }
});
