import type { Command, CommandCategory, CommandResult } from "./types.ts";

/**
 * Build a stub command. v0.4 sets isStub=true so the TUI can label these
 * commands as "v1.0 will implement". Handler returns a uniform text message.
 */
export function makeStub(
  name: string,
  description: string,
  category: CommandCategory,
): Command {
  return {
    name,
    description,
    category,
    isStub: true,
    async handle(): Promise<CommandResult> {
      return {
        kind: "text",
        payload: { text: `[/${name}] stub — v1.0 will implement.` },
      };
    },
  };
}
