import type { Command, CommandResult } from "../types.ts";

const help: Command = {
  name: "help",
  description: "Print built-in help; with arg, describe a specific command.",
  category: "diagnostics",
  isStub: false,
  async handle(ctx): Promise<CommandResult> {
    const target = ctx.args?.[0];
    const all = (ctx.state?.allCommands as Array<{ name: string; description: string }> | undefined) ?? [];
    if (target) {
      const hit = all.find((c) => c.name === target);
      if (!hit) return { kind: "text", payload: { text: `unknown command: ${target}` } };
      return { kind: "text", payload: { text: `/${hit.name} — ${hit.description}` } };
    }
    const text =
      all.length === 0
        ? "Type /<command>. See SPEC.md §D for the full list."
        : all
            .slice(0, 20)
            .map((c) => `  /${c.name.padEnd(18)} ${c.description}`)
            .join("\n");
    return { kind: "text", payload: { text, data: { count: all.length } } };
  },
};

export default help;
