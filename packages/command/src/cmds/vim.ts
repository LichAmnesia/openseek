import type { Command, CommandResult } from "../types.ts";

const vim: Command = {
  name: "vim",
  description: "Toggle vim modal editing in the input box.",
  category: "config",
  isStub: false,
  async handle(ctx): Promise<CommandResult> {
    const sub = ctx.args?.[0];
    const current = ctx.session?.vimEnabled ?? false;
    if (sub === "status") {
      return {
        kind: "text",
        payload: {
          text: `vim is ${current ? "ON" : "OFF"}`,
          data: { vim: current },
        },
      };
    }
    const next =
      sub === "on" ? true : sub === "off" ? false : !current;
    if (ctx.session) ctx.session.vimEnabled = next;
    return {
      kind: "action",
      payload: {
        action: "toggle-vim",
        text: `vim ${next ? "ON" : "OFF"}.`,
        data: { vim: next, prior: current },
      },
    };
  },
};

export default vim;
