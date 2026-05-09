import type { Command, CommandResult } from "../types.ts";

const exit: Command = {
  name: "exit",
  description: "Signal the harness to exit the current session cleanly.",
  category: "session",
  isStub: false,
  async handle(): Promise<CommandResult> {
    return {
      kind: "action",
      payload: { action: "exit", text: "exiting session…" },
    };
  },
};

export default exit;
