// G8.4 regression — `openseek -p` with provider "custom" and no base_url
// must fail fast with an actionable one-liner + exit 2, instead of dialing
// the stub http://localhost/v1, burning 3 SDK retries, and dumping a
// minified-bundle stack trace (observed 2026-07-14).
//
// Each case spawns the CLI as a subprocess with $HOME pinned to a throwaway
// dir. Subprocess isolation is load-bearing: Bun caches os.homedir() at
// startup, so mutating process.env.HOME in-process does NOT redirect
// loadConfig away from the developer's real ~/.openseek/config.toml — an
// in-process version of this test once hit a live endpoint and let the
// model write files into the repo.

import { expect, test } from "bun:test";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const CLI_ENTRY = join(import.meta.dir, "..", "src", "index.ts");
// cwd must stay inside the repo: bun needs the workspace bunfig.toml to
// resolve @opentui/solid's jsx-runtime. Config isolation comes from $HOME
// alone (the project overlay can't set provider/api_key/base_url anyway).
const REPO_ROOT = join(import.meta.dir, "..", "..", "..");

interface OneShotRun {
  exitCode: number;
  stdout: string;
  stderr: string;
}

async function runCli(args: string[], envOverride: Record<string, string>): Promise<OneShotRun> {
  const env: Record<string, string> = {
    // Minimal PATH so bun itself resolves; everything else is pinned.
    PATH: process.env.PATH ?? "",
    HOME: mkdtempSync(join(tmpdir(), "openseek-failfast-")),
    OPENSEEK_PROVIDER: "custom",
    OPENSEEK_MODEL: "qwen3.6-35b-a3b",
    ...envOverride,
  };
  const proc = Bun.spawn(["bun", CLI_ENTRY, ...args], {
    env,
    cwd: REPO_ROOT,
    stdout: "pipe",
    stderr: "pipe",
    stdin: "ignore",
  });
  const [stdout, stderr, exitCode] = await Promise.all([
    new Response(proc.stdout).text(),
    new Response(proc.stderr).text(),
    proc.exited,
  ]);
  return { exitCode, stdout, stderr };
}

test("G8.4: custom + no base_url → exit 2 + actionable message (text mode)", async () => {
  const run = await runCli(["-p", "say hi"], {});
  expect(run.exitCode).toBe(2);
  expect(run.stderr).toContain('provider "custom" needs a base URL');
  expect(run.stderr).toContain("base_url");
  expect(run.stderr).toContain("OPENSEEK_BASE_URL");
}, 30_000);

test("G8.4: custom + no base_url → NDJSON error + done failed (json mode)", async () => {
  const run = await runCli(["-p", "say hi", "--format", "json"], {});
  expect(run.exitCode).toBe(2);
  const events = run.stdout
    .split("\n")
    .filter((l) => l.trim() !== "")
    .map((l) => JSON.parse(l) as { type: string; message?: string; status?: string });
  const error = events.find((e) => e.type === "error");
  const done = events.find((e) => e.type === "done");
  expect(error?.message).toContain("base URL");
  expect(done?.status).toBe("failed");
}, 30_000);

test("G8.4: custom WITH base_url passes the gate (fails later only if unreachable)", async () => {
  // A routable base_url must NOT trip the fail-fast. Point at a port that
  // nothing listens on: the run gets past the gate and fails with exit 1
  // (session error), not the fail-fast's exit 2.
  const run = await runCli(["-p", "say hi", "--format", "json"], {
    OPENSEEK_BASE_URL: "http://127.0.0.1:1/v1",
  });
  expect(run.exitCode).toBe(1);
  expect(run.stdout).toContain('"type":"error"');
}, 60_000);
