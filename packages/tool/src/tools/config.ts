import { z } from "zod";
import { loadConfig } from "@openseek/provider";
import type { Tool, ToolResult } from "../types.ts";

const inputSchema = z.object({
  workspace: z
    .string()
    .min(1)
    .optional()
    .describe(
      "Optional workspace path override; defaults to the agent's cwd. Used for the project overlay layer.",
    ),
});

type ConfigInput = z.infer<typeof inputSchema>;

function maskKey(apiKey: string): string {
  if (!apiKey) return "(unset)";
  if (apiKey.length <= 4) return `…${apiKey}`;
  return `…${apiKey.slice(-4)}`;
}

const config: Tool<typeof inputSchema> = {
  name: "config",
  description:
    "Read-only snapshot of the resolved OpenSeek config (provider/model/baseURL + masked apiKey). Pulls from env → project overlay → user → defaults. NEVER prints the full apiKey.",
  inputSchema,
  permission: "auto",
  async call(input: ConfigInput, ctx): Promise<ToolResult> {
    let resolved: ReturnType<typeof loadConfig>;
    try {
      resolved = loadConfig(input.workspace ?? ctx.cwd);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      return { kind: "error", message: `loadConfig failed: ${msg}` };
    }
    const baseURL = resolved.baseURL ?? "(default)";
    const lines = [
      "openseek resolved config (read-only):",
      `  provider: ${resolved.provider}`,
      `  model:    ${resolved.model}`,
      `  baseURL:  ${baseURL}`,
      `  apiKey:   ${maskKey(resolved.apiKey)}`,
    ];
    return { kind: "text", text: lines.join("\n") };
  },
};

export default config;
