import { z } from "zod";
import { getDefaultTaskStore } from "../sqlite-store.ts";
import type { Tool, ToolResult } from "../types.ts";

const inputSchema = z.object({
  id: z.string().min(1).describe("Team id returned by team_create."),
});

type TeamDeleteInput = z.infer<typeof inputSchema>;

const teamDelete: Tool<typeof inputSchema> = {
  name: "team_delete",
  description:
    "Remove a team from the SQLite-backed task store (G3.6). Running tasks are NOT cancelled — that cascade lands when the cron daemon ships in v0.6.",
  inputSchema,
  permission: "auto",
  async call(input: TeamDeleteInput, ctx): Promise<ToolResult> {
    const store = getDefaultTaskStore();
    const team = store.getTeam(input.id);
    if (!team) {
      ctx.log.warn("team_delete: missing", { id: input.id });
      return { kind: "error", message: `team not found: ${input.id}` };
    }
    store.deleteTeam(input.id);
    return {
      kind: "text",
      text: `[team ${team.id} (${team.name}) deleted]`,
    };
  },
};

export default teamDelete;
