import type { Command, CommandResult } from "../types.ts";

const account: Command = {
  name: "account",
  description: "Display the active account / user.",
  category: "auth",
  isStub: false,
  async handle(ctx): Promise<CommandResult> {
    const acct = ctx.state?.account;
    if (acct === undefined || acct === null || acct === "") {
      return {
        kind: "text",
        payload: {
          text: "account: (anonymous) — v1.0 will populate from the auth subsystem",
          data: { account: null },
        },
      };
    }
    return {
      kind: "text",
      payload: { text: `account: ${String(acct)}`, data: { account: acct } },
    };
  },
};

export default account;
