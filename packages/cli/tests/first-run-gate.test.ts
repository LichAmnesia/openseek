// Phase 2 — first-run setup gate decision logic.
//
// Pure function tests so we don't have to spin up the wizard renderer.

import { test, expect } from "bun:test";
import { shouldRunSetup } from "../src/setup-gate.ts";
import type { ResolvedConfig } from "@openseek/provider";

const baseConfig = (
  apiKey: ResolvedConfig["source"]["apiKey"],
  provider = "mikan",
): { provider: string; source: ResolvedConfig["source"] } => ({
  provider,
  source: { provider: "default", model: "default", apiKey },
});

const baseArgs = {
  prompt: undefined as string | undefined,
  subcommand: undefined as "serve" | undefined,
  noSetup: false,
  version: false,
  help: false,
};

test("first-run + TTY + no special args → wizard runs", () => {
  expect(
    shouldRunSetup({
      config: baseConfig("default"),
      args: { ...baseArgs },
      isTTY: true,
    }),
  ).toBe(true);
});

test("apiKey from env → wizard does NOT run", () => {
  expect(
    shouldRunSetup({
      config: baseConfig("env"),
      args: { ...baseArgs },
      isTTY: true,
    }),
  ).toBe(false);
});

test("local provider without api key → wizard does NOT run", () => {
  expect(
    shouldRunSetup({
      config: baseConfig("default", "ollama"),
      args: { ...baseArgs },
      isTTY: true,
    }),
  ).toBe(false);
});

test("unknown provider without api key → wizard still runs", () => {
  expect(
    shouldRunSetup({
      config: baseConfig("default", "unknown"),
      args: { ...baseArgs },
      isTTY: true,
    }),
  ).toBe(true);
});

test("apiKey from user file → wizard does NOT run", () => {
  expect(
    shouldRunSetup({
      config: baseConfig("user"),
      args: { ...baseArgs },
      isTTY: true,
    }),
  ).toBe(false);
});

test("--no-setup bypasses even with default source", () => {
  expect(
    shouldRunSetup({
      config: baseConfig("default"),
      args: { ...baseArgs, noSetup: true },
      isTTY: true,
    }),
  ).toBe(false);
});

test("non-TTY (CI / pipe) → wizard does NOT run", () => {
  expect(
    shouldRunSetup({
      config: baseConfig("default"),
      args: { ...baseArgs },
      isTTY: false,
    }),
  ).toBe(false);
});

test("one-shot prompt → wizard does NOT run", () => {
  expect(
    shouldRunSetup({
      config: baseConfig("default"),
      args: { ...baseArgs, prompt: "hi" },
      isTTY: true,
    }),
  ).toBe(false);
});

test("`serve` subcommand → wizard does NOT run", () => {
  expect(
    shouldRunSetup({
      config: baseConfig("default"),
      args: { ...baseArgs, subcommand: "serve" },
      isTTY: true,
    }),
  ).toBe(false);
});

test("--version short-circuits before the gate runs", () => {
  expect(
    shouldRunSetup({
      config: baseConfig("default"),
      args: { ...baseArgs, version: true },
      isTTY: true,
    }),
  ).toBe(false);
});

test("--help short-circuits before the gate runs", () => {
  expect(
    shouldRunSetup({
      config: baseConfig("default"),
      args: { ...baseArgs, help: true },
      isTTY: true,
    }),
  ).toBe(false);
});
