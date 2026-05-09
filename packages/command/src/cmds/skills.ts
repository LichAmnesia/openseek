import { join } from "node:path";
import type { Command, CommandResult } from "../types.ts";

const skills: Command = {
  name: "skills",
  description: "List skills installed under .openseek/skills (or `install <spec>`).",
  category: "skills",
  isStub: false,
  async handle(ctx): Promise<CommandResult> {
    const sub = ctx.args?.[0];
    if (sub === "install") {
      const spec = ctx.args?.[1];
      if (!spec) return { kind: "text", payload: { text: "usage: /skills install <owner/repo>" } };
      return {
        kind: "action",
        payload: {
          action: "install-skill",
          text: `installing skill from ${spec}…`,
          data: { spec },
        },
      };
    }
    const root = join(ctx.cwd ?? process.cwd(), ".openseek", "skills");
    const fs = await import("node:fs");
    if (!fs.existsSync(root)) {
      return { kind: "text", payload: { text: `(no skills found in ${root})` } };
    }
    const names: string[] = [];
    for (const entry of fs.readdirSync(root, { withFileTypes: true })) {
      if (entry.isDirectory() && fs.existsSync(join(root, entry.name, "SKILL.md"))) {
        names.push(entry.name);
      }
    }
    names.sort();
    return {
      kind: "text",
      payload: {
        text: names.length ? names.map((n) => `  - ${n}`).join("\n") : `(no skills in ${root})`,
        data: { count: names.length, names },
      },
    };
  },
};

export default skills;
