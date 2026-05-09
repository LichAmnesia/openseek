import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, beforeEach, expect, test } from "bun:test";
import discoverSkills from "../src/tools/discover_skills.ts";
import { cleanupTmpDir, makeCtx, makeTmpDir } from "./helpers.ts";

let cwd: string;

beforeEach(() => {
  cwd = makeTmpDir("openseek-discover-skills-");
});

afterEach(() => {
  cleanupTmpDir(cwd);
});

test("discover_skills returns no-skills marker for empty workspace", async () => {
  const result = await discoverSkills.call({}, makeCtx(cwd));
  expect(result.kind).toBe("text");
  if (result.kind !== "text") throw new Error("unreachable");
  expect(result.text).toContain("no skills found");
});

test("discover_skills lists skills with SKILL.md", async () => {
  const skillsRoot = join(cwd, ".openseek", "skills");
  mkdirSync(join(skillsRoot, "alpha"), { recursive: true });
  mkdirSync(join(skillsRoot, "beta"), { recursive: true });
  mkdirSync(join(skillsRoot, "gamma"), { recursive: true });
  writeFileSync(join(skillsRoot, "alpha", "SKILL.md"), "# alpha");
  writeFileSync(join(skillsRoot, "beta", "SKILL.md"), "# beta");
  // gamma has no SKILL.md → should be skipped
  const result = await discoverSkills.call({}, makeCtx(cwd));
  if (result.kind !== "text") throw new Error("unreachable");
  expect(result.text).toContain("alpha");
  expect(result.text).toContain("beta");
  expect(result.text).not.toContain("gamma");
  expect(result.text).toContain("2 skill(s)");
});

test("discover_skills accepts custom root", async () => {
  const customRoot = join(cwd, "my-skills");
  mkdirSync(join(customRoot, "solo"), { recursive: true });
  writeFileSync(join(customRoot, "solo", "SKILL.md"), "# solo");
  const result = await discoverSkills.call({ root: customRoot }, makeCtx(cwd));
  if (result.kind !== "text") throw new Error("unreachable");
  expect(result.text).toContain("solo");
});
