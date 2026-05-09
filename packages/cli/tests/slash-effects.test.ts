// T2 / T3 / T4 — unit tests for slash-effects helpers (color env switch,
// debug log append, skill install).
//
// These cover the side-effect helpers in isolation. The dispatchSlash-side
// wiring is covered separately in dispatch-slash-effects.test.ts.

import { afterEach, beforeEach, expect, test } from "bun:test";
import { existsSync, mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

import {
  applyColorMode,
  appendDebugLogLine,
  deriveSkillName,
  installSkillFromSpec,
  normalizeCloneSpec,
} from "../src/slash-effects.ts";

let savedNoColor: string | undefined;
let savedForceColor: string | undefined;

beforeEach(() => {
  savedNoColor = process.env.NO_COLOR;
  savedForceColor = process.env.FORCE_COLOR;
  delete process.env.NO_COLOR;
  delete process.env.FORCE_COLOR;
});

afterEach(() => {
  if (savedNoColor === undefined) delete process.env.NO_COLOR;
  else process.env.NO_COLOR = savedNoColor;
  if (savedForceColor === undefined) delete process.env.FORCE_COLOR;
  else process.env.FORCE_COLOR = savedForceColor;
});

// ---- T2: applyColorMode ----

test("applyColorMode 'never' sets NO_COLOR=1 and clears FORCE_COLOR", () => {
  process.env.FORCE_COLOR = "1";
  applyColorMode("never");
  expect(process.env.NO_COLOR).toBe("1");
  expect(process.env.FORCE_COLOR).toBeUndefined();
});

test("applyColorMode 'always' sets FORCE_COLOR=1 and clears NO_COLOR", () => {
  process.env.NO_COLOR = "1";
  applyColorMode("always");
  expect(process.env.FORCE_COLOR).toBe("1");
  expect(process.env.NO_COLOR).toBeUndefined();
});

test("applyColorMode 'auto' clears both vars", () => {
  process.env.NO_COLOR = "1";
  process.env.FORCE_COLOR = "1";
  applyColorMode("auto");
  expect(process.env.NO_COLOR).toBeUndefined();
  expect(process.env.FORCE_COLOR).toBeUndefined();
});

test("applyColorMode 'never' then 'auto' round-trips cleanly", () => {
  applyColorMode("never");
  expect(process.env.NO_COLOR).toBe("1");
  applyColorMode("auto");
  expect(process.env.NO_COLOR).toBeUndefined();
  expect(process.env.FORCE_COLOR).toBeUndefined();
});

// ---- T3: appendDebugLogLine ----

test("appendDebugLogLine writes one JSON line when debug is ON", () => {
  const home = mkdtempSync(join(tmpdir(), "openseek-debug-"));
  try {
    appendDebugLogLine(
      { ts: "2026-05-06T00:00:00Z", type: "turn-end" },
      () => true,
      home,
    );
    const log = readFileSync(join(home, ".openseek", "debug.log"), "utf8");
    const lines = log.trim().split("\n");
    expect(lines.length).toBe(1);
    const parsed = JSON.parse(lines[0] ?? "{}");
    expect(parsed).toMatchObject({ type: "turn-end" });
  } finally {
    rmSync(home, { recursive: true, force: true });
  }
});

test("appendDebugLogLine no-ops when debug predicate is OFF", () => {
  const home = mkdtempSync(join(tmpdir(), "openseek-debug-"));
  try {
    appendDebugLogLine({ ts: "x", type: "y" }, () => false, home);
    expect(existsSync(join(home, ".openseek", "debug.log"))).toBe(false);
  } finally {
    rmSync(home, { recursive: true, force: true });
  }
});

test("appendDebugLogLine appends multiple lines on repeated calls", () => {
  const home = mkdtempSync(join(tmpdir(), "openseek-debug-"));
  try {
    appendDebugLogLine({ ts: "1", type: "tool-call" }, () => true, home);
    appendDebugLogLine({ ts: "2", type: "tool-result" }, () => true, home);
    const log = readFileSync(join(home, ".openseek", "debug.log"), "utf8");
    const lines = log.trim().split("\n");
    expect(lines.length).toBe(2);
  } finally {
    rmSync(home, { recursive: true, force: true });
  }
});

// ---- T4: installSkillFromSpec ----

test("installSkillFromSpec calls git clone with normalized spec + target", async () => {
  const cwd = mkdtempSync(join(tmpdir(), "openseek-skill-"));
  try {
    const spawnLog: string[][] = [];
    const rows: string[] = [];
    await installSkillFromSpec("octocat/Hello-World", {
      cwd,
      spawn: async (cmd) => {
        spawnLog.push(cmd);
        // Simulate a successful clone by creating the SKILL.md so the
        // existence probe succeeds.
        const target = cmd[3];
        if (target) {
          mkdirSync(target, { recursive: true });
          writeFileSync(join(target, "SKILL.md"), "# stub", "utf8");
        }
        return { stdout: "", stderr: "", exitCode: 0 };
      },
      appendRow: (text) => rows.push(text),
    });
    expect(spawnLog.length).toBe(1);
    const cmd = spawnLog[0] ?? [];
    expect(cmd[0]).toBe("git");
    expect(cmd[1]).toBe("clone");
    // Spec was normalized from owner/repo → https://github.com/...
    expect(cmd[2]).toBe("https://github.com/octocat/Hello-World.git");
    expect(cmd[3]).toBe(join(cwd, ".openseek", "skills", "Hello-World"));
    expect(rows.length).toBe(1);
    expect(rows[0]).toContain("Hello-World");
    expect(rows[0]).toContain("install-skill: installed");
  } finally {
    rmSync(cwd, { recursive: true, force: true });
  }
});

test("installSkillFromSpec surfaces git clone failure as a system row", async () => {
  const cwd = mkdtempSync(join(tmpdir(), "openseek-skill-"));
  try {
    const rows: string[] = [];
    await installSkillFromSpec("https://example.com/foo.git", {
      cwd,
      spawn: async () => ({ stdout: "", stderr: "fatal: nope", exitCode: 128 }),
      appendRow: (text) => rows.push(text),
    });
    expect(rows.length).toBe(1);
    expect(rows[0]).toContain("install-skill: git clone failed");
    expect(rows[0]).toContain("fatal: nope");
  } finally {
    rmSync(cwd, { recursive: true, force: true });
  }
});

test("installSkillFromSpec warns when SKILL.md is absent post-clone", async () => {
  const cwd = mkdtempSync(join(tmpdir(), "openseek-skill-"));
  try {
    const rows: string[] = [];
    await installSkillFromSpec("https://example.com/foo.git", {
      cwd,
      spawn: async (cmd) => {
        const target = cmd[3];
        if (target) mkdirSync(target, { recursive: true });
        return { stdout: "", stderr: "", exitCode: 0 };
      },
      appendRow: (text) => rows.push(text),
    });
    expect(rows[0]).toContain("no SKILL.md found");
  } finally {
    rmSync(cwd, { recursive: true, force: true });
  }
});

// ---- T4 helpers ----

test("deriveSkillName strips .git and trailing slashes", () => {
  expect(deriveSkillName("https://github.com/foo/bar.git")).toBe("bar");
  expect(deriveSkillName("https://github.com/foo/bar/")).toBe("bar");
  expect(deriveSkillName("octocat/Hello-World")).toBe("Hello-World");
  expect(deriveSkillName("git@github.com:org/repo.git")).toBe("repo");
});

test("normalizeCloneSpec rewrites owner/repo shorthand to github HTTPS URL", () => {
  expect(normalizeCloneSpec("octocat/Hello-World")).toBe(
    "https://github.com/octocat/Hello-World.git",
  );
  expect(normalizeCloneSpec("https://x/y.git")).toBe("https://x/y.git");
  expect(normalizeCloneSpec("git@host:org/repo.git")).toBe("git@host:org/repo.git");
});
