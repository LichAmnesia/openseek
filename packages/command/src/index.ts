// @openseek/command — 108 slash commands.
// SPEC.md milestones v0.4 G4.1 / G4.2.
//
// G4.1 ships every command name with at minimum a stub handler that returns
//      a uniform "v1.0 will implement" message.
// G4.2 ships ~50 commands with real handlers driving session/state mutations,
//      git plumbing, glob scans, etc. Each real command has at least one unit
//      test under packages/command/tests/commands.test.ts.

export const PACKAGE_NAME = "@openseek/command";

export type {
  Command,
  CommandCategory,
  CommandContext,
  CommandKind,
  CommandResult,
} from "./types.ts";
export { CommandRegistry, createRegistry } from "./registry.ts";
export { makeStub } from "./stub.ts";

import account from "./cmds/account.ts";
import addDir from "./cmds/add-dir.ts";
import advisor from "./cmds/advisor.ts";
import agents from "./cmds/agents.ts";
import agentsPlatform from "./cmds/agents-platform.ts";
import antTrace from "./cmds/ant-trace.ts";
import autofixPr from "./cmds/autofix-pr.ts";
import backfillSessions from "./cmds/backfill-sessions.ts";
import branch from "./cmds/branch.ts";
import breakCache from "./cmds/break-cache.ts";
import brief from "./cmds/brief.ts";
import btw from "./cmds/btw.ts";
import buddy from "./cmds/buddy.ts";
import bughunter from "./cmds/bughunter.ts";
import chrome from "./cmds/chrome.ts";
import clear from "./cmds/clear.ts";
import color from "./cmds/color.ts";
import commit from "./cmds/commit.ts";
import commitPushPr from "./cmds/commit-push-pr.ts";
import compact from "./cmds/compact.ts";
import config from "./cmds/config.ts";
import context from "./cmds/context.ts";
import copy from "./cmds/copy.ts";
import cost from "./cmds/cost.ts";
import ctxViz from "./cmds/ctx_viz.ts";
import debug from "./cmds/debug.ts";
import debugToolCall from "./cmds/debug-tool-call.ts";
import desktop from "./cmds/desktop.ts";
import diff from "./cmds/diff.ts";
import doctor from "./cmds/doctor.ts";
import effort from "./cmds/effort.ts";
import env from "./cmds/env.ts";
import exit from "./cmds/exit.ts";
import exportCmd from "./cmds/export.ts";
import extraUsage from "./cmds/extra-usage.ts";
import fast from "./cmds/fast.ts";
import feedback from "./cmds/feedback.ts";
import files from "./cmds/files.ts";
import fork from "./cmds/fork.ts";
import goodClaude from "./cmds/good-claude.ts";
import heapdump from "./cmds/heapdump.ts";
import help from "./cmds/help.ts";
import history from "./cmds/history.ts";
import hooks from "./cmds/hooks.ts";
import ide from "./cmds/ide.ts";
import init from "./cmds/init.ts";
import initVerifiers from "./cmds/init-verifiers.ts";
import insights from "./cmds/insights.ts";
import install from "./cmds/install.ts";
import installGithubApp from "./cmds/install-github-app.ts";
import installSlackApp from "./cmds/install-slack-app.ts";
import issue from "./cmds/issue.ts";
import keybindings from "./cmds/keybindings.ts";
import login from "./cmds/login.ts";
import logout from "./cmds/logout.ts";
import mcp from "./cmds/mcp.ts";
import memory from "./cmds/memory.ts";
import mobile from "./cmds/mobile.ts";
import mockLimits from "./cmds/mock-limits.ts";
import model from "./cmds/model.ts";
import note from "./cmds/note.ts";
import oauthRefresh from "./cmds/oauth-refresh.ts";
import onboarding from "./cmds/onboarding.ts";
import outputStyle from "./cmds/output-style.ts";
import passes from "./cmds/passes.ts";
import peers from "./cmds/peers.ts";
import perfIssue from "./cmds/perf-issue.ts";
import permissions from "./cmds/permissions.ts";
import plan from "./cmds/plan.ts";
import plugin from "./cmds/plugin.ts";
import prComments from "./cmds/pr_comments.ts";
import privacySettings from "./cmds/privacy-settings.ts";
import rateLimitOptions from "./cmds/rate-limit-options.ts";
import releaseNotes from "./cmds/release-notes.ts";
import reloadPlugins from "./cmds/reload-plugins.ts";
import remoteEnv from "./cmds/remote-env.ts";
import remoteSetup from "./cmds/remote-setup.ts";
import rename from "./cmds/rename.ts";
import resetLimits from "./cmds/reset-limits.ts";
import resume from "./cmds/resume.ts";
import review from "./cmds/review.ts";
import rewind from "./cmds/rewind.ts";
import sandboxToggle from "./cmds/sandbox-toggle.ts";
import securityReview from "./cmds/security-review.ts";
import session from "./cmds/session.ts";
import share from "./cmds/share.ts";
import skills from "./cmds/skills.ts";
import src from "./cmds/src.ts";
import stats from "./cmds/stats.ts";
import status from "./cmds/status.ts";
import statusline from "./cmds/statusline.ts";
import stickers from "./cmds/stickers.ts";
import summary from "./cmds/summary.ts";
import tag from "./cmds/tag.ts";
import tasks from "./cmds/tasks.ts";
import teleport from "./cmds/teleport.ts";
import terminalSetup from "./cmds/terminalSetup.ts";
import theme from "./cmds/theme.ts";
import thinkback from "./cmds/thinkback.ts";
import thinkbackPlay from "./cmds/thinkback-play.ts";
import ultraplan from "./cmds/ultraplan.ts";
import upgrade from "./cmds/upgrade.ts";
import usage from "./cmds/usage.ts";
import version from "./cmds/version.ts";
import vim from "./cmds/vim.ts";
import voice from "./cmds/voice.ts";
import workflows from "./cmds/workflows.ts";
import worktree from "./cmds/worktree.ts";

import { createRegistry } from "./registry.ts";
import type { Command } from "./types.ts";

/**
 * builtinCommands — 108 unique slash commands. Order: alphabetical-by-name
 * to keep the registry diff stable and the count assertion deterministic.
 */
export const builtinCommands: Command[] = [
  account,
  addDir,
  advisor,
  agents,
  agentsPlatform,
  antTrace,
  autofixPr,
  backfillSessions,
  branch,
  breakCache,
  brief,
  btw,
  buddy,
  bughunter,
  chrome,
  clear,
  color,
  commit,
  commitPushPr,
  compact,
  config,
  context,
  copy,
  cost,
  ctxViz,
  debug,
  debugToolCall,
  desktop,
  diff,
  doctor,
  effort,
  env,
  exit,
  exportCmd,
  extraUsage,
  fast,
  feedback,
  files,
  fork,
  goodClaude,
  heapdump,
  help,
  history,
  hooks,
  ide,
  init,
  initVerifiers,
  insights,
  install,
  installGithubApp,
  installSlackApp,
  issue,
  keybindings,
  login,
  logout,
  mcp,
  memory,
  mobile,
  mockLimits,
  model,
  note,
  oauthRefresh,
  onboarding,
  outputStyle,
  passes,
  peers,
  perfIssue,
  permissions,
  plan,
  plugin,
  prComments,
  privacySettings,
  rateLimitOptions,
  releaseNotes,
  reloadPlugins,
  remoteEnv,
  remoteSetup,
  rename,
  resetLimits,
  resume,
  review,
  rewind,
  sandboxToggle,
  securityReview,
  session,
  share,
  skills,
  src,
  stats,
  status,
  statusline,
  stickers,
  summary,
  tag,
  tasks,
  teleport,
  terminalSetup,
  theme,
  thinkback,
  thinkbackPlay,
  ultraplan,
  upgrade,
  usage,
  version,
  vim,
  voice,
  workflows,
  worktree,
];

export function defaultRegistry() {
  return createRegistry(builtinCommands);
}
