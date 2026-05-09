import type { Command, CommandResult } from "../types.ts";

const BINDINGS: Array<[string, string]> = [
  ["ctrl+c", "cancel current turn"],
  ["ctrl+d", "exit session"],
  ["ctrl+l", "clear screen"],
  ["esc", "interrupt streaming"],
  ["tab", "complete slash command"],
];

const keybindings: Command = {
  name: "keybindings",
  description: "List default keybindings for the TUI.",
  category: "config",
  isStub: false,
  async handle(): Promise<CommandResult> {
    const text = BINDINGS.map(([k, d]) => `  ${k.padEnd(8)}  ${d}`).join("\n");
    return {
      kind: "text",
      payload: { text: `keybindings:\n${text}`, data: { bindings: BINDINGS } },
    };
  },
};

export default keybindings;
