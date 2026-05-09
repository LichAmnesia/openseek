// @openseek/skill — workspace + global skill loader, GitHub installer.
// SPEC.md milestone v0.4 G4.3.

export const PACKAGE_NAME = "@openseek/skill";

export type {
  InstallResult,
  Skill,
  SkillFrontmatter,
  SkillScanResult,
  SkillSource,
} from "./types.ts";
export { parseSkillDoc } from "./frontmatter.ts";
export type { LoaderOptions } from "./loader.ts";
export { defaultSkillDirs, loadSkills } from "./loader.ts";
export type { InstallOptions, SpawnFn } from "./installer.ts";
export { installFromGithub } from "./installer.ts";
