import { z } from "zod";
import type { Tool, ToolResult } from "../types.ts";

const inputSchema = z.object({
  name: z.string().min(1).describe("Skill name from `.openseek/skills/<name>/SKILL.md`."),
  args: z
    .record(z.string(), z.unknown())
    .optional()
    .describe("Optional arguments forwarded to the skill prompt."),
});

type SkillInput = z.infer<typeof inputSchema>;

const skill: Tool<typeof inputSchema> = {
  name: "skill",
  description:
    "Invoke an OpenSeek skill (a packaged prompt + tool budget). v0.3 stub: acks the invocation; @openseek/skill will load and execute SKILL.md in a follow-on subagent.",
  inputSchema,
  permission: "auto",
  async call(input: SkillInput, ctx): Promise<ToolResult> {
    const argKeys = input.args ? Object.keys(input.args).join(",") : "(none)";
    ctx.log.info("skill [stub]", { name: input.name, argKeys });
    return {
      kind: "text",
      text: `[stub] [skill ${input.name} invoked args=${argKeys}]`,
    };
  },
};

export default skill;
