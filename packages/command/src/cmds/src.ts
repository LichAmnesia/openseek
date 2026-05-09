import type { Command, CommandResult } from "../types.ts";

const src: Command = {
  name: "src",
  description: "Open the OpenSeek source repo URL.",
  category: "advanced",
  isStub: false,
  async handle(): Promise<CommandResult> {
    const url = "https://github.com/openseek/openseek";
    return { kind: "text", payload: { text: url, data: { url } } };
  },
};

export default src;
