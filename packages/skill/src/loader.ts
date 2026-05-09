// Skill loader — scans the OpenSeek priority chain.
// Priority (highest → lowest):
//   1. <cwd>/.openseek/skills          — workspace-pinned
//   2. <cwd>/.agents/skills            — agent platform shared
//   3. <cwd>/.opencode/skills          — opencode compat
//   4. <cwd>/.claude/skills            — Claude Code compat
//   5. ~/.openseek/skills              — global per-user
// On collision (same skill name) the higher-priority directory wins.

import { join } from "node:path";
import { homedir } from "node:os";
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import type { Skill, SkillScanResult, SkillSource } from "./types.ts";
import { parseSkillDoc } from "./frontmatter.ts";

export interface LoaderOptions {
  cwd?: string;
  /** Override the global home directory (used in tests). */
  home?: string;
  /** Replace the default scan list entirely (used in tests). */
  dirs?: string[];
}

export function defaultSkillDirs(opts: LoaderOptions = {}): string[] {
  const cwd = opts.cwd ?? process.cwd();
  const home = opts.home ?? homedir();
  return [
    join(cwd, ".openseek", "skills"),
    join(cwd, ".agents", "skills"),
    join(cwd, ".opencode", "skills"),
    join(cwd, ".claude", "skills"),
    join(home, ".openseek", "skills"),
  ];
}

export function loadSkills(opts: LoaderOptions = {}): SkillScanResult {
  const dirs = opts.dirs ?? defaultSkillDirs(opts);
  const out = new Map<string, Skill>();
  const warnings: SkillScanResult["warnings"] = [];
  for (const dir of dirs) {
    if (!existsSync(dir)) continue;
    let entries: string[] = [];
    try {
      entries = readdirSync(dir);
    } catch (err) {
      warnings.push({ path: dir, message: errMsg(err) });
      continue;
    }
    for (const entry of entries) {
      const skillDir = join(dir, entry);
      let isDir = false;
      try {
        isDir = statSync(skillDir).isDirectory();
      } catch {
        continue;
      }
      if (!isDir) continue;
      const skillMd = join(skillDir, "SKILL.md");
      if (!existsSync(skillMd)) continue;
      try {
        const raw = readFileSync(skillMd, "utf8");
        const { frontmatter, body } = parseSkillDoc(raw);
        const name = (typeof frontmatter.name === "string" && frontmatter.name) || entry;
        if (out.has(name)) continue; // higher-priority dir already won
        const description =
          (typeof frontmatter.description === "string" && frontmatter.description) ||
          firstNonEmptyLine(body) ||
          "(no description)";
        out.set(name, {
          name,
          description,
          frontmatter,
          body,
          source: sourceFor(skillDir, opts),
          path: skillDir,
        });
      } catch (err) {
        warnings.push({ path: skillMd, message: errMsg(err) });
      }
    }
  }
  return { skills: Array.from(out.values()).sort((a, b) => a.name.localeCompare(b.name)), warnings };
}

function firstNonEmptyLine(body: string): string {
  for (const line of body.split(/\r?\n/)) {
    const t = line.trim();
    if (t) return t;
  }
  return "";
}

function sourceFor(skillDir: string, opts: LoaderOptions): SkillSource {
  const home = opts.home ?? homedir();
  return skillDir.startsWith(join(home, ".openseek")) ? "github" : "local";
}

function errMsg(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}
