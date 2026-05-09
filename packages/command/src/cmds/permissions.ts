import type { Command, CommandResult } from "../types.ts";

const permissions: Command = {
  name: "permissions",
  description: "Show effective tool permissions for the active mode.",
  category: "config",
  isStub: false,
  async handle(ctx): Promise<CommandResult> {
    const mode = ctx.session?.mode ?? "agent";
    const matrix: Record<string, string[]> = {
      plan: ["read", "search", "ask"],
      agent: ["read", "search", "edit", "bash:ask"],
      yolo: ["read", "search", "edit", "bash:auto"],
    };
    const allowed = matrix[mode] ?? [];
    return {
      kind: "text",
      payload: {
        text: `mode=${mode}\nallowed: ${allowed.join(", ")}`,
        data: { mode, allowed },
      },
    };
  },
};

export default permissions;
