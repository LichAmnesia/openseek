import { describe, expect, test } from "bun:test";
import { z } from "zod";
import type { AnyTool, ToolPermission } from "@openseek/tool";
import { filterToolsByMode } from "../src/mode-gate.ts";

function fakeTool(name: string, permission: ToolPermission): AnyTool {
  return {
    name,
    description: `${name} tool`,
    inputSchema: z.object({}),
    permission,
    async call() {
      return { kind: "text", text: name };
    },
  };
}

function registry(): Map<string, AnyTool> {
  return new Map<string, AnyTool>([
    ["read", fakeTool("read", "auto")],
    ["glob", fakeTool("glob", "auto")],
    ["grep", fakeTool("grep", "auto")],
    ["write", fakeTool("write", "deny-in-plan")],
    ["edit", fakeTool("edit", "deny-in-plan")],
    ["ask-thing", fakeTool("ask-thing", "ask")],
  ]);
}

describe("filterToolsByMode", () => {
  test("plan mode strips deny-in-plan tools", () => {
    const filtered = filterToolsByMode(registry(), "plan");
    const names = Array.from(filtered.keys()).sort();
    expect(names).toEqual(["ask-thing", "glob", "grep", "read"]);
    expect(filtered.has("write")).toBe(false);
    expect(filtered.has("edit")).toBe(false);
  });

  test("agent mode passes every tool through", () => {
    const filtered = filterToolsByMode(registry(), "agent");
    expect(filtered.size).toBe(6);
    expect(filtered.has("write")).toBe(true);
    expect(filtered.has("edit")).toBe(true);
  });

  test("yolo mode passes every tool through (same set as agent)", () => {
    const filtered = filterToolsByMode(registry(), "yolo");
    expect(filtered.size).toBe(6);
    expect(Array.from(filtered.keys()).sort()).toEqual([
      "ask-thing",
      "edit",
      "glob",
      "grep",
      "read",
      "write",
    ]);
  });

  test("empty input map returns empty map for every mode", () => {
    expect(filterToolsByMode(new Map(), "plan").size).toBe(0);
    expect(filterToolsByMode(new Map(), "agent").size).toBe(0);
    expect(filterToolsByMode(new Map(), "yolo").size).toBe(0);
  });

  test("all-deny-in-plan map collapses to empty under plan", () => {
    const all = new Map<string, AnyTool>([
      ["w", fakeTool("w", "deny-in-plan")],
      ["e", fakeTool("e", "deny-in-plan")],
    ]);
    expect(filterToolsByMode(all, "plan").size).toBe(0);
    expect(filterToolsByMode(all, "agent").size).toBe(2);
  });

  test("returned map is a fresh copy — caller mutations don't leak in", () => {
    const src = registry();
    const filtered = filterToolsByMode(src, "agent");
    src.delete("read");
    expect(filtered.has("read")).toBe(true);
  });
});
