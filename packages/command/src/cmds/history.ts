import type { Command, CommandResult } from "../types.ts";

const history: Command = {
  name: "history",
  description: "Print a brief history snapshot of session message kinds.",
  category: "advanced",
  isStub: false,
  async handle(ctx): Promise<CommandResult> {
    const msgs = (ctx.session?.messages ?? []) as Array<{ role?: string }>;
    if (msgs.length === 0) return { kind: "text", payload: { text: "(no history)" } };
    const counts: Record<string, number> = {};
    for (const m of msgs) {
      const role = (m && typeof m === "object" && m.role) ? m.role : "unknown";
      counts[role] = (counts[role] ?? 0) + 1;
    }
    const text = Object.entries(counts)
      .map(([r, c]) => `  ${r}: ${c}`)
      .join("\n");
    return { kind: "text", payload: { text: `history (${msgs.length}):\n${text}`, data: counts } };
  },
};

export default history;
