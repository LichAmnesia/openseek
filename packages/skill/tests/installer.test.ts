import { test, expect } from "bun:test";
import { mkdtempSync, existsSync, writeFileSync, mkdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { installFromGithub, type SpawnFn } from "../src/installer.ts";

function withTmp(fn: (root: string) => void | Promise<void>) {
  const root = mkdtempSync(join(tmpdir(), "openseek-installer-"));
  return Promise.resolve(fn(root)).finally(() => {
    rmSync(root, { recursive: true, force: true });
  });
}

test("rejects bad spec format", async () => {
  const r = await installFromGithub("not-a-spec");
  expect(r.ok).toBe(false);
  expect(r.message).toContain("bad spec");
});

test("returns idempotent ok=true if dest already exists", async () => {
  await withTmp(async (root) => {
    const target = join(root, "skills");
    mkdirSync(join(target, "octocat-Hello-World"), { recursive: true });
    const r = await installFromGithub("octocat/Hello-World", { target });
    expect(r.ok).toBe(true);
    expect(r.message).toContain("already installed");
  });
});

test("propagates gh non-zero exit", async () => {
  await withTmp(async (root) => {
    const spawn: SpawnFn = async () => ({ stdout: new Uint8Array(), stderr: "boom", exitCode: 4 });
    const r = await installFromGithub("octocat/Hello-World", {
      target: join(root, "skills"),
      spawn,
    });
    expect(r.ok).toBe(false);
    expect(r.message).toContain("gh api failed");
  });
});

test("handles empty tarball as failure", async () => {
  await withTmp(async (root) => {
    const spawn: SpawnFn = async (cmd) => {
      if (cmd[0] === "gh") return { stdout: new Uint8Array(), stderr: "", exitCode: 0 };
      return { stdout: new Uint8Array(), stderr: "", exitCode: 0 };
    };
    const r = await installFromGithub("octocat/Hello-World", {
      target: join(root, "skills"),
      spawn,
    });
    expect(r.ok).toBe(false);
    expect(r.message).toContain("empty tarball");
  });
});

test("happy path: writes installation directory", async () => {
  await withTmp(async (root) => {
    const target = join(root, "skills");
    mkdirSync(target, { recursive: true });
    const spawn: SpawnFn = async (cmd) => {
      if (cmd[0] === "gh") {
        return { stdout: new TextEncoder().encode("fake-tarball"), stderr: "", exitCode: 0 };
      }
      // Simulate `tar -xz -C <staging>`: write a marker file into the staging dir.
      const i = cmd.indexOf("-C");
      const staging = i >= 0 ? cmd[i + 1] : undefined;
      if (staging) writeFileSync(join(staging, "SKILL.md"), "---\nname: x\n---\n");
      return { stdout: new Uint8Array(), stderr: "", exitCode: 0 };
    };
    const r = await installFromGithub("foo/bar", { target, spawn });
    expect(r.ok).toBe(true);
    expect(r.installedAt).toBeDefined();
    expect(existsSync(join(target, "foo-bar", "SKILL.md"))).toBe(true);
  });
});
