import type { Command, CommandResult } from "../types.ts";

const logout: Command = {
  name: "logout",
  description: "Clear local auth tokens.",
  category: "auth",
  isStub: false,
  async handle(ctx): Promise<CommandResult> {
    if (ctx.state) {
      delete ctx.state.token;
      delete ctx.state.account;
    }
    return {
      kind: "action",
      payload: { action: "logout", text: "local credentials cleared." },
    };
  },
};

export default logout;
