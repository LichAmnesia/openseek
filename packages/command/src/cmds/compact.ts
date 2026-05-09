import type { Command, CommandResult } from "../types.ts";

const compact: Command = {
  name: "compact",
  description: "Trigger a manual session-memory compaction pass to free context budget.",
  category: "session",
  isStub: false,
  async handle(ctx): Promise<CommandResult> {
    const count = ctx.session?.messages?.length ?? 0;
    return {
      kind: "action",
      payload: {
        action: "compact-session",
        text: `requested compaction over ${count} message(s); strategy: sessionMemoryCompact.`,
        data: { messageCount: count, strategy: "sessionMemoryCompact" },
      },
    };
  },
};

export default compact;
