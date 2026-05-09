// @openseek/tool — file/search/exec built-ins for OpenSeek.
// Each tool exports a default `Tool<Schema>` instance and is paired with a
// prompt.txt describing its contract for the planner/executor.
// v0.1 (G1.5): read / write / edit / glob / grep
// v0.2 (G2.7): + bash / apply_patch / web_fetch / web_search / notebook_edit
//              + todo_write / ask_user_question / enter_plan_mode
//              + exit_plan_mode / agent_spawn
// v0.3 (G3.1): + 37 more tools (powershell / repl / sleep / task_* /
//              team_* / monitor / schedule_cron / remote_trigger /
//              send_message / send_user_file / terminal_capture /
//              enter_worktree / exit_worktree / verify_plan_execution /
//              workflow / mcp / mcp_auth / list_mcp_resources /
//              read_mcp_resource / skill / discover_skills / tool_search /
//              config / brief / review_artifact / suggest_background_pr /
//              snip / synthetic_output / rlm_query / lsp / web_browser).
//              Most G3.1 additions are stubs flagged with `[stub]` markers
//              for the v0.3 follow-on subagents (G3.2 / G3.4 / G3.5 / G3.6
//              / G3.7 / G3.8) to swap in real impls.
// post-v1.0:   mcp + mcp_auth + list_mcp_resources + read_mcp_resource now
//              route through @openseek/mcp router; web_search hits
//              lite.duckduckgo.com; web_browser bridges to an MCP browser
//              server; ask_user_question / send_user_file gained DI hooks;
//              send_message persists into the sqlite messages table;
//              terminal_capture tails ~/.openseek/logs/<session>.log;
//              remote_trigger POSTs JSON for real.

export const PACKAGE_NAME = "@openseek/tool";

export type {
  AnyTool,
  Tool,
  ToolContext,
  ToolLogger,
  ToolMode,
  ToolPermission,
  ToolResult,
} from "./types.ts";
export { noopLogger } from "./types.ts";
export { createRegistry, ToolRegistry } from "./registry.ts";
export { ensureRelative, resolveWithinCwd } from "./workspace.ts";
export { setAgentSpawnDeps } from "./tools/agent_spawn.ts";
export { setAskUserHandler, type AskUserHandler, type AskUserRequest } from "./tools/ask_user_question.ts";
export { getMcpRouter, setMcpRouter } from "./tools/mcp.ts";
export { setSendUserFileHandler, type SendUserFileHandler } from "./tools/send_user_file.ts";
export { setRemoteTriggerFetch } from "./tools/remote_trigger.ts";
export { setWebSearchFetch } from "./tools/web_search.ts";
export {
  defaultDbPath,
  getDefaultTaskStore,
  nextStoreId,
  openTaskStore,
  setDefaultTaskStore,
  type CronRow,
  type InsertCronInput,
  type InsertMessageInput,
  type InsertTaskInput,
  type InsertTeamInput,
  type ListMessagesFilter,
  type MessageRow,
  type TaskRow,
  type TaskStatus,
  type TaskStore,
  type TeamRow,
  type UpdateTaskInput,
} from "./sqlite-store.ts";

import { createRegistry } from "./registry.ts";
import agentSpawn from "./tools/agent_spawn.ts";
import applyPatch from "./tools/apply_patch.ts";
import askUserQuestion from "./tools/ask_user_question.ts";
import bash from "./tools/bash.ts";
import brief from "./tools/brief.ts";
import config from "./tools/config.ts";
import discoverSkills from "./tools/discover_skills.ts";
import edit from "./tools/edit.ts";
import enterPlanMode from "./tools/enter_plan_mode.ts";
import enterWorktree from "./tools/enter_worktree.ts";
import exitPlanMode from "./tools/exit_plan_mode.ts";
import exitWorktree from "./tools/exit_worktree.ts";
import glob from "./tools/glob.ts";
import grep from "./tools/grep.ts";
import listMcpResources from "./tools/list_mcp_resources.ts";
import lsp from "./tools/lsp.ts";
import mcp from "./tools/mcp.ts";
import mcpAuth from "./tools/mcp_auth.ts";
import monitor from "./tools/monitor.ts";
import notebookEdit from "./tools/notebook_edit.ts";
import powershell from "./tools/powershell.ts";
import read from "./tools/read.ts";
import readMcpResource from "./tools/read_mcp_resource.ts";
import remoteTrigger from "./tools/remote_trigger.ts";
import repl from "./tools/repl.ts";
import reviewArtifact from "./tools/review_artifact.ts";
import rlmQuery from "./tools/rlm_query.ts";
import scheduleCron from "./tools/schedule_cron.ts";
import sendMessage from "./tools/send_message.ts";
import sendUserFile from "./tools/send_user_file.ts";
import skill from "./tools/skill.ts";
import sleep from "./tools/sleep.ts";
import snip from "./tools/snip.ts";
import suggestBackgroundPr from "./tools/suggest_background_pr.ts";
import syntheticOutput from "./tools/synthetic_output.ts";
import taskCreate from "./tools/task_create.ts";
import taskGet from "./tools/task_get.ts";
import taskList from "./tools/task_list.ts";
import taskOutput from "./tools/task_output.ts";
import taskStop from "./tools/task_stop.ts";
import taskUpdate from "./tools/task_update.ts";
import teamCreate from "./tools/team_create.ts";
import teamDelete from "./tools/team_delete.ts";
import terminalCapture from "./tools/terminal_capture.ts";
import todoWrite from "./tools/todo_write.ts";
import toolSearch from "./tools/tool_search.ts";
import verifyPlanExecution from "./tools/verify_plan_execution.ts";
import webBrowser from "./tools/web_browser.ts";
import webFetch from "./tools/web_fetch.ts";
import webSearch from "./tools/web_search.ts";
import workflow from "./tools/workflow.ts";
import write from "./tools/write.ts";
import type { AnyTool } from "./types.ts";

export {
  agentSpawn,
  applyPatch,
  askUserQuestion,
  bash,
  brief,
  config,
  discoverSkills,
  edit,
  enterPlanMode,
  enterWorktree,
  exitPlanMode,
  exitWorktree,
  glob,
  grep,
  listMcpResources,
  lsp,
  mcp,
  mcpAuth,
  monitor,
  notebookEdit,
  powershell,
  read,
  readMcpResource,
  remoteTrigger,
  repl,
  reviewArtifact,
  rlmQuery,
  scheduleCron,
  sendMessage,
  sendUserFile,
  skill,
  sleep,
  snip,
  suggestBackgroundPr,
  syntheticOutput,
  taskCreate,
  taskGet,
  taskList,
  taskOutput,
  taskStop,
  taskUpdate,
  teamCreate,
  teamDelete,
  terminalCapture,
  todoWrite,
  toolSearch,
  verifyPlanExecution,
  webBrowser,
  webFetch,
  webSearch,
  workflow,
  write,
};

// builtinTools: 15 v0.1+v0.2 tools first (insertion order preserved for
// stable registry diffs), then the 37 v0.3 G3.1 additions sorted by name.
export const builtinTools: AnyTool[] = [
  // v0.1 (G1.5)
  read,
  write,
  edit,
  glob,
  grep,
  // v0.2 (G2.7)
  bash,
  applyPatch,
  webFetch,
  webSearch,
  notebookEdit,
  todoWrite,
  askUserQuestion,
  enterPlanMode,
  exitPlanMode,
  agentSpawn,
  // v0.3 (G3.1) — alphabetical
  brief,
  config,
  discoverSkills,
  enterWorktree,
  exitWorktree,
  listMcpResources,
  lsp,
  mcp,
  mcpAuth,
  monitor,
  powershell,
  readMcpResource,
  remoteTrigger,
  repl,
  reviewArtifact,
  rlmQuery,
  scheduleCron,
  sendMessage,
  sendUserFile,
  skill,
  sleep,
  snip,
  suggestBackgroundPr,
  syntheticOutput,
  taskCreate,
  taskGet,
  taskList,
  taskOutput,
  taskStop,
  taskUpdate,
  teamCreate,
  teamDelete,
  terminalCapture,
  toolSearch,
  verifyPlanExecution,
  webBrowser,
  workflow,
];

export function defaultRegistry() {
  return createRegistry(builtinTools);
}
