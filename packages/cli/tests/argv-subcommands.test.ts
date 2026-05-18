// Phase 3 — new subcommands `setup` / `model` (in addition to the existing
// `serve`).

import { test, expect } from "bun:test";
import { parseArgv } from "../src/argv.ts";

test("`openseek setup` → subcommand: setup", () => {
  expect(parseArgv(["setup"]).subcommand).toBe("setup");
});

test("`openseek model` → subcommand: model", () => {
  expect(parseArgv(["model"]).subcommand).toBe("model");
});

test("`openseek serve` → subcommand: serve (existing)", () => {
  expect(parseArgv(["serve"]).subcommand).toBe("serve");
});

test("`openseek doctor` → subcommand: doctor", () => {
  expect(parseArgv(["doctor"]).subcommand).toBe("doctor");
});

test("setup + --no-setup keeps subcommand: setup (--no-setup ignored here)", () => {
  const r = parseArgv(["setup", "--no-setup"]);
  expect(r.subcommand).toBe("setup");
});

test("empty argv → no subcommand", () => {
  expect(parseArgv([]).subcommand).toBeUndefined();
});

test("non-subcommand first positional stays as prompt", () => {
  const r = parseArgv(["explain this"]);
  expect(r.subcommand).toBeUndefined();
  expect(r.prompt).toBe("explain this");
});

test("setup + --provider passes through other flags", () => {
  const r = parseArgv(["setup", "--provider", "openai"]);
  expect(r.subcommand).toBe("setup");
  expect(r.provider).toBe("openai");
});
