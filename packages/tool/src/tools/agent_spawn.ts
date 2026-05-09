import { z } from "zod";
import type { Tool, ToolResult } from "../types.ts";

const inputSchema = z.object({
  prompt: z.string().min(1).describe("Task description handed to the sub-agent."),
  model: z
    .string()
    .min(1)
    .optional()
    .describe("Optional model id override (e.g. 'deepseek-v4-flash')."),
  timeoutMs: z
    .number()
    .int()
    .positive()
    .optional()
    .describe("Hard wall-clock timeout in ms (default 60_000)."),
});

type AgentSpawnInput = z.infer<typeof inputSchema>;

const SUMMARY_LIMIT = 120;
const OUTPUT_LIMIT = 4000;

function truncate(text: string, max: number): string {
  const trimmed = text.trim().replace(/\s+/g, " ");
  if (trimmed.length <= max) return trimmed;
  return `${trimmed.slice(0, max - 1)}…`;
}

// ---------- runtime injection slot ----------
//
// agent_spawn needs a real provider + tool registry to fork a child session.
// Those wiring details live one layer up (cli/session host), so we expose
// a setter that the host fills at startup. v0.3 tests inject mock deps
// directly. When unset, the tool returns a clear error rather than silently
// failing.

import type { AgentSpawnDeps } from "@openseek/agent";

let injectedDeps: AgentSpawnDeps | undefined;

export function setAgentSpawnDeps(deps: AgentSpawnDeps | undefined): void {
  injectedDeps = deps;
}

const agentSpawn: Tool<typeof inputSchema> = {
  name: "agent_spawn",
  description:
    "Fork an in-process sub-agent that runs an independent session on the given prompt. Parent continues; child output is streamed back when it reaches turn-end. Supports timeout + cooperative abort via the parent signal.",
  inputSchema,
  permission: "ask",
  async call(input: AgentSpawnInput, ctx): Promise<ToolResult> {
    if (!injectedDeps) {
      ctx.log.warn("agent_spawn invoked without injected deps");
      return {
        kind: "error",
        message: "agent_spawn deps not configured (call setAgentSpawnDeps at host startup)",
      };
    }
    const { spawnAgent } = await import("@openseek/agent");
    const deps = input.model ? { ...injectedDeps, model: input.model } : injectedDeps;
    const handle = spawnAgent({ prompt: input.prompt, timeoutMs: input.timeoutMs }, deps);

    // Bind parent's abort to the child's abort: if the parent turn cancels,
    // the child must cancel cooperatively.
    const onParentAbort = (): void => handle.abort();
    if (ctx.abort.aborted) handle.abort();
    else ctx.abort.addEventListener("abort", onParentAbort, { once: true });

    try {
      const res = await handle.result;
      const summary = truncate(input.prompt, SUMMARY_LIMIT);
      const output = truncate(res.output, OUTPUT_LIMIT);
      const tag = `[sub-agent ${res.id} status=${res.status} ms=${res.ms}]`;
      const errLine = res.error ? `\n[error: ${res.error}]` : "";
      return {
        kind: "text",
        text: `${tag}\nprompt: ${summary}\n${output}${errLine}`,
      };
    } finally {
      ctx.abort.removeEventListener("abort", onParentAbort);
    }
  },
};

export default agentSpawn;
