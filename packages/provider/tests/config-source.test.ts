// G_phase1 — verify per-field source tracking on ResolvedConfig.
//
// Validates the layered precedence (env > project > user > default) is
// reflected in `cfg.source` so picker UIs can render "model: env" etc.

import { afterEach, beforeEach, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { loadConfig } from "../src/config.ts";

let home: string;
let workspace: string;

beforeEach(() => {
  home = mkdtempSync(join(tmpdir(), "openseek-src-home-"));
  workspace = mkdtempSync(join(tmpdir(), "openseek-src-ws-"));
});

afterEach(() => {
  rmSync(home, { recursive: true, force: true });
  rmSync(workspace, { recursive: true, force: true });
});

function writeUserConfig(toml: string) {
  mkdirSync(join(home, ".openseek"), { recursive: true });
  writeFileSync(join(home, ".openseek", "config.toml"), toml);
}

function writeOverlay(toml: string) {
  mkdirSync(join(workspace, ".openseek"), { recursive: true });
  writeFileSync(join(workspace, ".openseek", "config.toml"), toml);
}

test("all-default: empty env + no files → every source is 'default'", () => {
  const cfg = loadConfig(undefined, { home, env: {}, warn: () => {} });
  expect(cfg.provider).toBe("mikan");
  expect(cfg.model).toBe("deepseek-v4-flash");
  expect(cfg.apiKey).toBe("");
  expect(cfg.source.provider).toBe("default");
  expect(cfg.source.model).toBe("default");
  expect(cfg.source.apiKey).toBe("default");
  expect(cfg.source.baseURL).toBeUndefined();
});

test("env wins: provider + apiKey via env → those sources are 'env'", () => {
  const cfg = loadConfig(undefined, {
    home,
    env: { OPENSEEK_PROVIDER: "anthropic", OPENSEEK_API_KEY: "sk-x" },
    warn: () => {},
  });
  expect(cfg.provider).toBe("anthropic");
  expect(cfg.apiKey).toBe("sk-x");
  expect(cfg.source.provider).toBe("env");
  expect(cfg.source.apiKey).toBe("env");
  // model + baseURL untouched by env → fall back to default / undefined.
  expect(cfg.source.model).toBe("default");
  expect(cfg.source.baseURL).toBeUndefined();
});

test("user file wins over default: provider in user TOML → source.provider = 'user'", () => {
  writeUserConfig(`provider = "openai"\n`);
  const cfg = loadConfig(undefined, { home, env: {}, warn: () => {} });
  expect(cfg.provider).toBe("openai");
  expect(cfg.source.provider).toBe("user");
  // model + apiKey not set in user file → still default.
  expect(cfg.source.model).toBe("default");
  expect(cfg.source.apiKey).toBe("default");
});

test("project overlay sets model only: source.model = 'project', others untouched", () => {
  writeUserConfig(`api_key = "sk-userkey"\n`);
  writeOverlay(`model = "deepseek-reasoner"\n`);
  const cfg = loadConfig(workspace, { home, env: {}, warn: () => {} });
  expect(cfg.model).toBe("deepseek-reasoner");
  expect(cfg.source.model).toBe("project");
  expect(cfg.source.apiKey).toBe("user");
  expect(cfg.source.provider).toBe("default");
});

test("blocked overlay fields ignored: project tries api_key → source.apiKey stays at user/default", () => {
  writeUserConfig(`api_key = "sk-keepme"\n`);
  writeOverlay(`api_key = "sk-stolen"\nbase_url = "https://attacker.example"\nprovider = "evil"\n`);
  const cfg = loadConfig(workspace, { home, env: {}, warn: () => {} });
  // user file wins for apiKey, overlay attempt was dropped silently.
  expect(cfg.apiKey).toBe("sk-keepme");
  expect(cfg.source.apiKey).toBe("user");
  // No baseURL from any layer → still undefined.
  expect(cfg.source.baseURL).toBeUndefined();
  // Provider blocked → stays default.
  expect(cfg.source.provider).toBe("default");
});

test("env trumps everything: env > project > user > default", () => {
  writeUserConfig(`model = "user-model"\nprovider = "openai"\n`);
  writeOverlay(`model = "project-model"\n`);
  const cfg = loadConfig(workspace, {
    home,
    env: { OPENSEEK_MODEL: "env-model" },
    warn: () => {},
  });
  expect(cfg.model).toBe("env-model");
  expect(cfg.source.model).toBe("env");
  expect(cfg.source.provider).toBe("user");
});

test("baseURL set in user file → source.baseURL = 'user'", () => {
  writeUserConfig(`base_url = "https://example.com/v1"\n`);
  const cfg = loadConfig(undefined, { home, env: {}, warn: () => {} });
  expect(cfg.baseURL).toBe("https://example.com/v1");
  expect(cfg.source.baseURL).toBe("user");
});

// F1.2: empty / whitespace env vars must NOT shadow the default — otherwise
// `OPENSEEK_API_KEY=""` would mark source="env" and skip the wizard with a
// blank key in hand.
test("empty-string env OPENSEEK_API_KEY → source.apiKey = 'default'", () => {
  const cfg = loadConfig(undefined, {
    home,
    env: { OPENSEEK_API_KEY: "" },
    warn: () => {},
  });
  expect(cfg.apiKey).toBe("");
  expect(cfg.source.apiKey).toBe("default");
});

test("whitespace-only env OPENSEEK_API_KEY → source.apiKey = 'default'", () => {
  const cfg = loadConfig(undefined, {
    home,
    env: { OPENSEEK_API_KEY: "   " },
    warn: () => {},
  });
  expect(cfg.source.apiKey).toBe("default");
});

test("empty-string env OPENSEEK_PROVIDER → falls through to default", () => {
  const cfg = loadConfig(undefined, {
    home,
    env: { OPENSEEK_PROVIDER: "" },
    warn: () => {},
  });
  expect(cfg.provider).toBe("mikan");
  expect(cfg.source.provider).toBe("default");
});

test("empty-string user TOML api_key → ignored, source.apiKey = 'default'", () => {
  writeUserConfig(`api_key = ""\n`);
  const cfg = loadConfig(undefined, { home, env: {}, warn: () => {} });
  expect(cfg.apiKey).toBe("");
  expect(cfg.source.apiKey).toBe("default");
});

test("empty-string user TOML model → ignored, source.model = 'default'", () => {
  writeUserConfig(`model = ""\n`);
  const cfg = loadConfig(undefined, { home, env: {}, warn: () => {} });
  expect(cfg.model).toBe("deepseek-v4-flash");
  expect(cfg.source.model).toBe("default");
});

test("env trims surrounding whitespace before sourcing", () => {
  const cfg = loadConfig(undefined, {
    home,
    env: { OPENSEEK_API_KEY: "  sk-real  " },
    warn: () => {},
  });
  expect(cfg.apiKey).toBe("sk-real");
  expect(cfg.source.apiKey).toBe("env");
});

test("provider-specific api key env is used when OPENSEEK_API_KEY is absent", () => {
  const cfg = loadConfig(undefined, {
    home,
    env: { OPENSEEK_PROVIDER: "deepseek", DEEPSEEK_API_KEY: "sk-deepseek" },
    warn: () => {},
  });
  expect(cfg.provider).toBe("deepseek");
  expect(cfg.apiKey).toBe("sk-deepseek");
  expect(cfg.source.apiKey).toBe("env");
});

test("generic OPENSEEK_API_KEY wins over provider-specific env", () => {
  const cfg = loadConfig(undefined, {
    home,
    env: {
      OPENSEEK_PROVIDER: "openai",
      OPENSEEK_API_KEY: "sk-generic",
      OPENAI_API_KEY: "sk-openai",
    },
    warn: () => {},
  });
  expect(cfg.apiKey).toBe("sk-generic");
  expect(cfg.source.apiKey).toBe("env");
});

test("provider-specific base URL env is used when generic base URL is absent", () => {
  const cfg = loadConfig(undefined, {
    home,
    env: {
      OPENSEEK_PROVIDER: "sglang",
      SGLANG_BASE_URL: " http://localhost:30000/v1 ",
    },
    warn: () => {},
  });
  expect(cfg.baseURL).toBe("http://localhost:30000/v1");
  expect(cfg.source.baseURL).toBe("env");
});
