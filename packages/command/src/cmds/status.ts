import type { Command, CommandResult } from "../types.ts";

const status: Command = {
  name: "status",
  description: "Print runtime status info: uptime, mode, message count.",
  category: "diagnostics",
  isStub: false,
  async handle(ctx): Promise<CommandResult> {
    const lines = [
      `pid:       ${process.pid}`,
      `node-ish:  ${typeof Bun !== "undefined" ? `bun ${Bun.version}` : "node"}`,
      `mode:      ${ctx.session?.mode ?? "agent"}`,
      `messages:  ${ctx.session?.messages?.length ?? 0}`,
    ];
    return { kind: "text", payload: { text: lines.join("\n"), data: { pid: process.pid } } };
  },
};

export default status;
