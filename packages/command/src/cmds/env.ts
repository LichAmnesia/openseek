import type { Command, CommandResult } from "../types.ts";

const env: Command = {
  name: "env",
  description: "Show OpenSeek-relevant environment variables.",
  category: "config",
  isStub: false,
  async handle(): Promise<CommandResult> {
    const keys = [
      "OPENSEEK_HOME",
      "OPENSEEK_MODEL",
      "OPENSEEK_LOG_LEVEL",
      "ANTHROPIC_API_KEY",
      "OPENAI_API_KEY",
    ];
    const lines = keys.map((k) => {
      const v = process.env[k];
      const shown = v ? `${v.slice(0, 4)}…(${v.length})` : "(unset)";
      return `  ${k} = ${shown}`;
    });
    return {
      kind: "text",
      payload: { text: `env:\n${lines.join("\n")}`, data: { keys } },
    };
  },
};

export default env;
