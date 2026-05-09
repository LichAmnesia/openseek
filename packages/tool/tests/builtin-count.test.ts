import { expect, test } from "bun:test";
import { builtinTools, defaultRegistry } from "../src/index.ts";

test("builtinTools contains all 52 G3.1 tools", () => {
  expect(builtinTools.length).toBe(52);
});

test("builtinTools have unique names", () => {
  const names = builtinTools.map((t) => t.name);
  const unique = new Set(names);
  expect(unique.size).toBe(names.length);
});

test("defaultRegistry registers every builtin", () => {
  const reg = defaultRegistry();
  expect(reg.size()).toBe(builtinTools.length);
  for (const t of builtinTools) {
    expect(reg.has(t.name)).toBe(true);
  }
});

test("every builtin has a non-empty description and a permission tag", () => {
  for (const t of builtinTools) {
    expect(t.name.length).toBeGreaterThan(0);
    expect(t.description.length).toBeGreaterThan(0);
    expect(["auto", "ask", "deny-in-plan"]).toContain(t.permission);
  }
});

test("side-effect and remote tools require approval or are blocked in plan", () => {
  const permissions = new Map(builtinTools.map((t) => [t.name, t.permission]));
  expect(permissions.get("web_browser")).toBe("ask");
  expect(permissions.get("agent_spawn")).toBe("ask");
  expect(permissions.get("remote_trigger")).toBe("ask");
  expect(permissions.get("task_stop")).toBe("ask");
  expect(permissions.get("send_message")).toBe("ask");
  expect(permissions.get("send_user_file")).toBe("ask");
  expect(permissions.get("schedule_cron")).toBe("ask");
  expect(permissions.get("mcp_auth")).toBe("ask");
  expect(permissions.get("enter_worktree")).toBe("deny-in-plan");
  expect(permissions.get("exit_worktree")).toBe("deny-in-plan");
});
