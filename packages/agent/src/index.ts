// @openseek/agent — Sub-agent spawn + RLM parallel children.
// SPEC.md milestones: v0.3 G3.2 (rlm_query) + G3.3 (agent_spawn).

export const PACKAGE_NAME = "@openseek/agent";

export { DEFAULT_RLM_MAX_PARALLEL, mockRunner, runRlm } from "./rlm.ts";
export { spawnAgent } from "./spawn.ts";

export type {
  AgentHandle,
  AgentResult,
  AgentSpawnDeps,
  AgentSpawnRequest,
  RlmResult,
  RlmRunner,
  RunRlmOptions,
} from "./types.ts";
