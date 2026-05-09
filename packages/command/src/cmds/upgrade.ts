import type { Command, CommandResult } from "../types.ts";

const upgrade: Command = {
  name: "upgrade",
  description: "Check for OpenSeek updates (planning surface only in v0.4).",
  category: "diagnostics",
  isStub: false,
  async handle(): Promise<CommandResult> {
    return {
      kind: "text",
      payload: {
        text: "no upstream registry yet — upgrade currently a no-op. Track v1.0 release notes.",
        data: { upgradeAvailable: false },
      },
    };
  },
};

export default upgrade;
