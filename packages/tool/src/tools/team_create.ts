import { z } from "zod";
import { getDefaultTaskStore, nextStoreId } from "../sqlite-store.ts";
import type { Tool, ToolResult } from "../types.ts";

const inputSchema = z.object({
  name: z.string().min(1).max(80).describe("Human-readable team name."),
  members: z
    .array(z.string().min(1))
    .optional()
    .describe("Initial roster of agent ids / role tags (default empty)."),
});

type TeamCreateInput = z.infer<typeof inputSchema>;

const teamCreate: Tool<typeof inputSchema> = {
  name: "team_create",
  description:
    "Define a logical team of sub-agents that share a queue. Persists the roster in the SQLite-backed store (G3.6).",
  inputSchema,
  permission: "auto",
  async call(input: TeamCreateInput, ctx): Promise<ToolResult> {
    const id = nextStoreId("team");
    const members = input.members ?? [];
    const row = getDefaultTaskStore().insertTeam({ id, name: input.name, members });
    ctx.log.info("team_create", { id, name: input.name });
    return {
      kind: "text",
      text: `[team created: id=${row.id} name=${row.name} members=${row.members.length}]`,
    };
  },
};

export default teamCreate;
