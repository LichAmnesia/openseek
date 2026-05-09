import type { Command, CommandResult } from "../types.ts";

const addDir: Command = {
  name: "add-dir",
  description: "Extend cwd allowlist by adding another directory.",
  category: "tools",
  isStub: false,
  async handle(ctx): Promise<CommandResult> {
    const dir = ctx.args?.[0];
    if (!dir) {
      return { kind: "text", payload: { text: "usage: /add-dir <path>" } };
    }
    const list = (ctx.state?.allowedDirs as string[] | undefined) ?? [];
    if (!list.includes(dir)) list.push(dir);
    if (ctx.state) ctx.state.allowedDirs = list;
    return {
      kind: "action",
      payload: {
        action: "add-dir",
        text: `added '${dir}' (allowlist size: ${list.length})`,
        data: { dirs: list },
      },
    };
  },
};

export default addDir;
