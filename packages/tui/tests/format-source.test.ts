// Phase 3 — status-bar source tag formatter.
//
// The tag tells the user where the active config came from. Loudest signal
// wins:
//   env > default > project > user
//
// "default" beats "project"/"user" because we want the user to know the
// session is partially using fallbacks.

import { test, expect } from "bun:test";
import { formatSourceTag } from "../src/format-source.ts";
import type { ConfigSources } from "@openseek/provider";

const cs = (
  provider: ConfigSources["provider"],
  model: ConfigSources["model"],
  apiKey: ConfigSources["apiKey"],
  baseURL?: ConfigSources["baseURL"],
): ConfigSources => {
  const out: ConfigSources = { provider, model, apiKey };
  if (baseURL !== undefined) out.baseURL = baseURL;
  return out;
};

test("all default → (default)", () => {
  expect(formatSourceTag(cs("default", "default", "default"))).toBe(" (default)");
});

test("model env, others default → (env)", () => {
  expect(formatSourceTag(cs("default", "env", "default"))).toBe(" (env)");
});

test("apiKey env, others default → (env)", () => {
  expect(formatSourceTag(cs("default", "default", "env"))).toBe(" (env)");
});

test("provider+model+apiKey all user → (config)", () => {
  expect(formatSourceTag(cs("user", "user", "user"))).toBe(" (config)");
});

test("mix env + default → (env) (env wins)", () => {
  expect(formatSourceTag(cs("env", "default", "default"))).toBe(" (env)");
  expect(formatSourceTag(cs("env", "user", "default"))).toBe(" (env)");
});

test("mix user + default → (default) (default wins because not all configured)", () => {
  expect(formatSourceTag(cs("user", "user", "default"))).toBe(" (default)");
  expect(formatSourceTag(cs("default", "user", "user"))).toBe(" (default)");
});

test("project + user (no env, no default) → (project)", () => {
  expect(formatSourceTag(cs("user", "project", "user"))).toBe(" (project)");
});

test("env beats project beats user beats default in any combo", () => {
  expect(formatSourceTag(cs("env", "project", "user"))).toBe(" (env)");
  expect(formatSourceTag(cs("project", "user", "user"))).toBe(" (project)");
});

test("baseURL source participates in the loudest-source tag", () => {
  expect(formatSourceTag(cs("user", "user", "user", "env"))).toBe(" (env)");
  expect(formatSourceTag(cs("user", "user", "user", "project"))).toBe(" (project)");
  expect(formatSourceTag(cs("user", "user", "user", "user"))).toBe(" (config)");
});
