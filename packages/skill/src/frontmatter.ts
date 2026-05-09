// Minimal YAML-ish frontmatter parser. Lives in-tree to avoid a `yaml`
// dependency for the skill package — frontmatter shapes we accept are
// limited to scalars + simple flow lists like `tags: [a, b, c]` (or block
// lists with `- entry` lines).

import type { SkillFrontmatter } from "./types.ts";

export interface ParsedSkillDoc {
  frontmatter: SkillFrontmatter;
  body: string;
}

export function parseSkillDoc(raw: string): ParsedSkillDoc {
  if (!raw.startsWith("---")) {
    return { frontmatter: {}, body: raw };
  }
  const end = raw.indexOf("\n---", 3);
  if (end === -1) return { frontmatter: {}, body: raw };
  const yaml = raw.slice(3, end).replace(/^\n/, "");
  const bodyStart = raw.indexOf("\n", end + 4);
  const body = bodyStart === -1 ? "" : raw.slice(bodyStart + 1);
  return { frontmatter: parseYaml(yaml), body };
}

function parseYaml(src: string): SkillFrontmatter {
  const out: SkillFrontmatter = {};
  const lines = src.split(/\r?\n/);
  let pendingKey: string | null = null;
  let pendingList: string[] | null = null;
  for (const rawLine of lines) {
    const line = rawLine.trimEnd();
    if (line === "" || line.trimStart().startsWith("#")) continue;
    if (line.startsWith("  - ") || line.startsWith("- ")) {
      if (pendingKey && pendingList) {
        pendingList.push(stripQuotes(line.replace(/^\s*- /, "").trim()));
      }
      continue;
    }
    if (pendingKey && pendingList) {
      out[pendingKey] = pendingList;
      pendingKey = null;
      pendingList = null;
    }
    const m = /^([A-Za-z_][\w-]*)\s*:\s*(.*)$/.exec(line);
    if (!m) continue;
    const key = m[1] as string;
    const valueRaw = (m[2] ?? "").trim();
    if (valueRaw === "") {
      pendingKey = key;
      pendingList = [];
      continue;
    }
    if (valueRaw.startsWith("[") && valueRaw.endsWith("]")) {
      const inner = valueRaw.slice(1, -1).trim();
      out[key] = inner === "" ? [] : inner.split(",").map((s) => stripQuotes(s.trim()));
      continue;
    }
    out[key] = coerce(stripQuotes(valueRaw));
  }
  if (pendingKey && pendingList) out[pendingKey] = pendingList;
  return out;
}

function stripQuotes(v: string): string {
  if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) {
    return v.slice(1, -1);
  }
  return v;
}

function coerce(v: string): string | number | boolean {
  if (v === "true") return true;
  if (v === "false") return false;
  if (/^-?\d+$/.test(v)) return Number(v);
  if (/^-?\d+\.\d+$/.test(v)) return Number(v);
  return v;
}
