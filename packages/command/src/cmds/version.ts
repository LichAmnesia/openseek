import type { Command, CommandResult } from "../types.ts";

const VERSION = "0.4.0-alpha";

const version: Command = {
  name: "version",
  description: "Print the OpenSeek harness version.",
  category: "diagnostics",
  isStub: false,
  async handle(): Promise<CommandResult> {
    return {
      kind: "text",
      payload: { text: `openseek ${VERSION}`, data: { version: VERSION } },
    };
  },
};

export default version;
