// Types for @openseek/skill — workspace + global skill discovery & install.

export type SkillSource = "github" | "local";

export interface SkillFrontmatter {
  /** Human-readable skill name (overrides directory name). */
  name?: string;
  /** Free-form description for the planner / TUI. */
  description?: string;
  /** Optional version string, e.g. "1.2.0". */
  version?: string;
  /** Tag list — used for tool-search style retrieval. */
  tags?: string[];
  /** Allow-list of tools the skill is permitted to call. */
  allowTools?: string[];
  /** Catch-all for additional fields. */
  [key: string]: unknown;
}

export interface Skill {
  /** Directory name; if `frontmatter.name` is set the renderer prefers it. */
  name: string;
  description: string;
  frontmatter: SkillFrontmatter;
  /** SKILL.md body without frontmatter. */
  body: string;
  source: SkillSource;
  /** Absolute path to the skill directory. */
  path: string;
}

export interface SkillScanResult {
  skills: Skill[];
  /** Sources with errors are reported but never abort discovery. */
  warnings: Array<{ path: string; message: string }>;
}

export interface InstallResult {
  ok: boolean;
  spec: string;
  installedAt?: string;
  message: string;
}
