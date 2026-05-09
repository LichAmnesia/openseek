import { z } from "zod";
import { join } from "node:path";
import type { Tool, ToolResult } from "../types.ts";

const inputSchema = z.object({
  root: z
    .string()
    .min(1)
    .optional()
    .describe(
      "Directory to scan; default '<cwd>/.openseek/skills'. Each immediate subdirectory containing SKILL.md is a skill.",
    ),
});

type DiscoverSkillsInput = z.infer<typeof inputSchema>;

const discoverSkills: Tool<typeof inputSchema> = {
  name: "discover_skills",
  description:
    "Scan the workspace for installed skills (folders with SKILL.md) and return their names. v0.3 partial impl: walks one directory level via Bun.glob; full skill metadata parsing arrives with @openseek/skill.",
  inputSchema,
  permission: "auto",
  async call(input: DiscoverSkillsInput, ctx): Promise<ToolResult> {
    const root = input.root ?? join(ctx.cwd, ".openseek", "skills");
    // Bun.Glob.scan throws ENOENT when `cwd` is missing — treat that as
    // "no skills" instead of an error so callers can probe optimistically.
    const fs = await import("node:fs");
    if (!fs.existsSync(root)) {
      return { kind: "text", text: `[no skills found in ${root}]` };
    }
    const glob = new Bun.Glob("*/SKILL.md");
    const names: string[] = [];
    try {
      for await (const match of glob.scan({ cwd: root, onlyFiles: true })) {
        const dir = match.split("/")[0];
        if (dir) names.push(dir);
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      return { kind: "error", message: `failed to scan ${root}: ${msg}` };
    }
    names.sort();
    if (names.length === 0) {
      return { kind: "text", text: `[no skills found in ${root}]` };
    }
    return {
      kind: "text",
      text: `${names.length} skill(s) in ${root}:\n${names.map((n) => `  - ${n}`).join("\n")}`,
    };
  },
};

export default discoverSkills;
