// Phase 3 — slash-command parser.
//
// Pure tests; no TUI mount.

import { test, expect } from "bun:test";
import {
  getSlashCompletions,
  nextSlashCompletion,
  parseSlashCommand,
  SLASH_COMMANDS,
} from "../src/slash-command.ts";

test("/model parses to model command", () => {
  expect(parseSlashCommand("/model")).toEqual({ type: "model", args: [] });
});

test("/provider parses to provider command", () => {
  expect(parseSlashCommand("/provider")).toEqual({ type: "provider", args: [] });
});

test("/help parses to help command", () => {
  expect(parseSlashCommand("/help")).toEqual({ type: "help", args: [] });
});

test("/quit parses to quit command", () => {
  expect(parseSlashCommand("/quit")).toEqual({ type: "quit", args: [] });
});

test("/exit is alias for /quit", () => {
  expect(parseSlashCommand("/exit")).toEqual({ type: "quit", args: [] });
});

test("/clear parses to clear command", () => {
  expect(parseSlashCommand("/clear")).toEqual({ type: "clear", args: [] });
});

test("uppercase /MODEL still parses (case-insensitive)", () => {
  expect(parseSlashCommand("/MODEL")).toEqual({ type: "model", args: [] });
  expect(parseSlashCommand("/Help")).toEqual({ type: "help", args: [] });
});

test("unknown slash command returns unknown with command name", () => {
  expect(parseSlashCommand("/foo")).toEqual({ type: "unknown", command: "foo", args: [] });
  expect(parseSlashCommand("/bar baz")).toEqual({
    type: "unknown",
    command: "bar",
    args: ["baz"],
  });
});

test("leading whitespace disqualifies as a slash command", () => {
  expect(parseSlashCommand("  /model")).toBeNull();
  expect(parseSlashCommand("\t/model")).toBeNull();
});

test("free text returns null", () => {
  expect(parseSlashCommand("not a command")).toBeNull();
  expect(parseSlashCommand("hello /model")).toBeNull();
});

test("empty input returns null", () => {
  expect(parseSlashCommand("")).toBeNull();
});

test("/ alone parses to unknown with empty command", () => {
  expect(parseSlashCommand("/")).toEqual({ type: "unknown", command: "", args: [] });
});

test("trailing whitespace is trimmed", () => {
  expect(parseSlashCommand("/model   ")).toEqual({ type: "model", args: [] });
  expect(parseSlashCommand("/help\n")).toEqual({ type: "help", args: [] });
});

test("SLASH_COMMANDS contains the 5 visible commands", () => {
  const names = SLASH_COMMANDS.map((c) => c.name);
  expect(names).toContain("/model");
  expect(names).toContain("/provider");
  expect(names).toContain("/clear");
  expect(names).toContain("/help");
  expect(names).toContain("/quit");
  expect(SLASH_COMMANDS.length).toBe(5);
});

test("each SLASH_COMMANDS entry has a non-empty description", () => {
  for (const c of SLASH_COMMANDS) {
    expect(c.description.length).toBeGreaterThan(0);
  }
});

test("getSlashCompletions returns visible candidates for slash prefixes", () => {
  expect(getSlashCompletions("hello").active).toBe(false);
  expect(getSlashCompletions("/").candidates.map((c) => c.name)).toEqual(
    SLASH_COMMANDS.map((c) => c.name),
  );
  expect(getSlashCompletions("/mo").candidates.map((c) => c.name)).toEqual(["/model"]);
  expect(getSlashCompletions("/MODEL").candidates.map((c) => c.name)).toEqual(["/model"]);
  expect(getSlashCompletions("/model ").active).toBe(false);
});

test("nextSlashCompletion completes and cycles candidates", () => {
  const first = nextSlashCompletion("/mo");
  expect(first?.value).toBe("/model");

  const allFirst = nextSlashCompletion("/");
  expect(allFirst?.value).toBe(SLASH_COMMANDS[0]?.name);
  const allSecond = nextSlashCompletion(allFirst?.value ?? "", allFirst?.session);
  expect(allSecond?.value).toBe(SLASH_COMMANDS[1]?.name);
  const back = nextSlashCompletion(allSecond?.value ?? "", allSecond?.session, -1);
  expect(back?.value).toBe(SLASH_COMMANDS[0]?.name);
});

test("custom slash command list parses registry-backed commands and args", () => {
  const commands = [
    { name: "/commit", description: "Commit changes" },
    { name: "doctor", description: "Run diagnostics" },
  ];
  expect(parseSlashCommand("/commit fix slash", commands)).toEqual({
    type: "command",
    name: "commit",
    args: ["fix", "slash"],
  });
  expect(parseSlashCommand("/doctor", commands)).toEqual({
    type: "command",
    name: "doctor",
    args: [],
  });
  expect(getSlashCompletions("/do", commands).candidates.map((c) => c.name)).toEqual([
    "/doctor",
  ]);
});

test("getSlashCompletions ranks fuzzy name and description matches", () => {
  const commands = [
    { name: "/reset-limits", description: "Reset usage caps" },
    { name: "/doctor", description: "Run diagnostics" },
    { name: "/config", description: "Inspect diagnostics config" },
  ];
  expect(getSlashCompletions("/rst", commands).candidates.map((c) => c.name)).toEqual([
    "/reset-limits",
  ]);
  expect(getSlashCompletions("/diag", commands).candidates.map((c) => c.name)).toEqual([
    "/doctor",
    "/config",
  ]);
});
