import { join } from "node:path";
import type { Command, CommandResult } from "../types.ts";

const init: Command = {
  name: "init",
  description: "Initialize an .openseek workspace folder in cwd.",
  category: "skills",
  isStub: false,
  async handle(ctx): Promise<CommandResult> {
    const fs = await import("node:fs");
    const cwd = ctx.cwd ?? process.cwd();
    const dir = join(cwd, ".openseek");
    const created: string[] = [];
    for (const sub of ["", "skills", "plugins", "config"]) {
      const p = sub ? join(dir, sub) : dir;
      if (!fs.existsSync(p)) {
        fs.mkdirSync(p, { recursive: true });
        created.push(p);
      }
    }
    return {
      kind: "text",
      payload: {
        text: created.length === 0 ? `already initialized at ${dir}` : `created:\n${created.join("\n")}`,
        data: { created, root: dir },
      },
    };
  },
};

export default init;
