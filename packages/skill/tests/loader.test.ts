import { test, expect } from "bun:test";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { defaultSkillDirs, loadSkills } from "../src/loader.ts";

function withTmp(fn: (root: string) => void | Promise<void>) {
  const root = mkdtempSync(join(tmpdir(), "openseek-skill-"));
  return Promise.resolve(fn(root)).finally(() => {
    rmSync(root, { recursive: true, force: true });
  });
}

function makeSkill(dir: string, name: string, frontmatter: string, body = "skill body") {
  const skillDir = join(dir, name);
  mkdirSync(skillDir, { recursive: true });
  writeFileSync(join(skillDir, "SKILL.md"), `---\n${frontmatter}\n---\n${body}\n`);
}

test("defaultSkillDirs returns 5 entries in priority order", () => {
  const dirs = defaultSkillDirs({ cwd: "/cwd", home: "/home" });
  expect(dirs.length).toBe(5);
  expect(dirs[0]).toContain(".openseek/skills");
  expect(dirs[4]).toContain("/home/.openseek/skills");
});

test("loadSkills picks up a single skill with frontmatter", async () => {
  await withTmp(async (root) => {
    const dir = join(root, ".openseek", "skills");
    mkdirSync(dir, { recursive: true });
    makeSkill(
      dir,
      "alpha",
      "name: alpha\ndescription: hello world\ntags: [a, b]",
      "## body",
    );
    const r = loadSkills({ cwd: root, home: root });
    expect(r.skills.length).toBe(1);
    expect(r.skills[0]?.name).toBe("alpha");
    expect(r.skills[0]?.description).toBe("hello world");
    expect(r.skills[0]?.frontmatter.tags).toEqual(["a", "b"]);
    expect(r.skills[0]?.body).toContain("## body");
  });
});

test("higher-priority directory wins on collision", async () => {
  await withTmp(async (root) => {
    const high = join(root, ".openseek", "skills");
    const low = join(root, ".claude", "skills");
    mkdirSync(high, { recursive: true });
    mkdirSync(low, { recursive: true });
    makeSkill(high, "ping", "description: high");
    makeSkill(low, "ping", "description: low");
    const r = loadSkills({ cwd: root, home: root });
    expect(r.skills.length).toBe(1);
    expect(r.skills[0]?.description).toBe("high");
  });
});

test("loadSkills returns empty when no dirs exist", async () => {
  await withTmp(async (root) => {
    const r = loadSkills({ cwd: root, home: root });
    expect(r.skills.length).toBe(0);
    expect(r.warnings.length).toBe(0);
  });
});

test("description falls back to first non-empty body line", async () => {
  await withTmp(async (root) => {
    const dir = join(root, ".openseek", "skills");
    mkdirSync(dir, { recursive: true });
    makeSkill(dir, "noheader", "name: noheader", "\n\nthe first real line\nlater");
    const r = loadSkills({ cwd: root, home: root });
    expect(r.skills[0]?.description).toBe("the first real line");
  });
});

test("custom dirs short-circuits the priority chain", async () => {
  await withTmp(async (root) => {
    const custom = join(root, "anywhere");
    mkdirSync(custom, { recursive: true });
    makeSkill(custom, "x", "description: yo");
    const r = loadSkills({ dirs: [custom] });
    expect(r.skills.map((s) => s.name)).toEqual(["x"]);
  });
});

test("non-skill subdirectories are ignored", async () => {
  await withTmp(async (root) => {
    const dir = join(root, ".openseek", "skills");
    mkdirSync(join(dir, "noop"), { recursive: true });
    makeSkill(dir, "real", "description: real");
    const r = loadSkills({ cwd: root, home: root });
    expect(r.skills.map((s) => s.name)).toEqual(["real"]);
  });
});

test("global home directory is tagged source=github", async () => {
  await withTmp(async (root) => {
    const home = join(root, "home");
    const homeSkills = join(home, ".openseek", "skills");
    mkdirSync(homeSkills, { recursive: true });
    makeSkill(homeSkills, "remote", "description: from gh");
    const r = loadSkills({ cwd: root, home });
    expect(r.skills[0]?.source).toBe("github");
  });
});
