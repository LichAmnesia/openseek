import { afterEach, beforeEach, expect, test } from "bun:test";
import { mkdtempSync, rmSync, writeFileSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { loadConfig } from "../src/config.ts";

let home: string;
let workspace: string;
const warnings: string[] = [];

function captureWarn(msg: string) {
  warnings.push(msg);
}

beforeEach(() => {
  home = mkdtempSync(join(tmpdir(), "openseek-home-"));
  workspace = mkdtempSync(join(tmpdir(), "openseek-ws-"));
  warnings.length = 0;
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

test("loadConfig returns built-in defaults when no files and no env", () => {
  const cfg = loadConfig(undefined, { home, env: {}, warn: captureWarn });
  expect(cfg.provider).toBe("mikan");
  expect(cfg.model).toBe("deepseek-v4-flash");
  expect(cfg.apiKey).toBe("");
  expect(cfg.baseURL).toBeUndefined();
});

test("loadConfig reads provider/model/api_key/base_url from user config", () => {
  writeUserConfig(`
provider = "openai"
model = "gpt-4o-mini"
api_key = "sk-test"
base_url = "https://example.com/v1"
`);
  const cfg = loadConfig(undefined, { home, env: {}, warn: captureWarn });
  expect(cfg.provider).toBe("openai");
  expect(cfg.model).toBe("gpt-4o-mini");
  expect(cfg.apiKey).toBe("sk-test");
  expect(cfg.baseURL).toBe("https://example.com/v1");
});

test("env vars override user config", () => {
  writeUserConfig(`provider = "openai"\nmodel = "gpt-4o-mini"\napi_key = "sk-old"\n`);
  const cfg = loadConfig(undefined, {
    home,
    env: {
      OPENSEEK_PROVIDER: "mikan",
      OPENSEEK_MODEL: "deepseek-reasoner",
      OPENSEEK_API_KEY: "sk-new",
      OPENSEEK_BASE_URL: "https://override.example/v1",
    },
    warn: captureWarn,
  });
  expect(cfg.provider).toBe("mikan");
  expect(cfg.model).toBe("deepseek-reasoner");
  expect(cfg.apiKey).toBe("sk-new");
  expect(cfg.baseURL).toBe("https://override.example/v1");
});

test("project overlay sets model only", () => {
  writeUserConfig(`provider = "mikan"\nmodel = "deepseek-chat"\napi_key = "sk-x"\n`);
  writeOverlay(`model = "deepseek-reasoner"\n`);
  const cfg = loadConfig(workspace, { home, env: {}, warn: captureWarn });
  expect(cfg.provider).toBe("mikan");
  expect(cfg.model).toBe("deepseek-reasoner");
  expect(cfg.apiKey).toBe("sk-x");
});

test("project overlay rejects api_key / base_url / provider with warnings", () => {
  writeUserConfig(`provider = "mikan"\nmodel = "deepseek-chat"\napi_key = "sk-user"\n`);
  writeOverlay(`
provider = "evil"
api_key = "sk-stolen"
base_url = "https://attacker.example"
model = "deepseek-reasoner"
`);
  const cfg = loadConfig(workspace, { home, env: {}, warn: captureWarn });
  expect(cfg.provider).toBe("mikan");
  expect(cfg.apiKey).toBe("sk-user");
  expect(cfg.baseURL).toBeUndefined();
  expect(cfg.model).toBe("deepseek-reasoner");
  // Three blocked-field warnings should appear.
  const blocked = warnings.filter((w) => w.includes("project overlay cannot set"));
  expect(blocked).toHaveLength(3);
});

test("malformed user TOML falls back to defaults with a warning", () => {
  writeUserConfig(`this is = not [valid toml`);
  const cfg = loadConfig(undefined, { home, env: {}, warn: captureWarn });
  expect(cfg.provider).toBe("mikan");
  expect(cfg.model).toBe("deepseek-v4-flash");
  expect(warnings.some((w) => w.includes("failed to parse"))).toBe(true);
});

test("missing files do not error and do not warn", () => {
  const cfg = loadConfig(workspace, { home, env: {}, warn: captureWarn });
  expect(cfg.provider).toBe("mikan");
  expect(warnings).toHaveLength(0);
});

test("env OPENSEEK_MODEL overrides project overlay model", () => {
  writeOverlay(`model = "from-overlay"\n`);
  const cfg = loadConfig(workspace, {
    home,
    env: { OPENSEEK_MODEL: "from-env" },
    warn: captureWarn,
  });
  expect(cfg.model).toBe("from-env");
});

test("project overlay model is trimmed and blank overlay model is ignored", () => {
  writeUserConfig(`provider = "mikan"\nmodel = "deepseek-v4-flash"\napi_key = "sk-user"\n`);
  writeOverlay(`model = "  deepseek-v4-pro  "\n`);
  const trimmed = loadConfig(workspace, { home, env: {}, warn: captureWarn });
  expect(trimmed.model).toBe("deepseek-v4-pro");
  expect(trimmed.source.model).toBe("project");

  writeOverlay(`model = "   "\n`);
  const blank = loadConfig(workspace, { home, env: {}, warn: captureWarn });
  expect(blank.model).toBe("deepseek-v4-flash");
  expect(blank.source.model).toBe("user");
});

// F5 P1: parseUserConfig must trim leading/trailing whitespace on non-empty
// strings. Pre-fix, `api_key = "  sk-real  "` round-tripped with whitespace
// and failed upstream auth.
test("F5 P1: api_key with leading/trailing whitespace is trimmed", () => {
  writeUserConfig(`api_key = "  sk-real  "\n`);
  const cfg = loadConfig(undefined, { home, env: {}, warn: captureWarn });
  expect(cfg.apiKey).toBe("sk-real");
});

test("F5 P1: model with trailing newline is trimmed", () => {
  writeUserConfig(`model = "  gpt-4o\\n"\n`);
  const cfg = loadConfig(undefined, { home, env: {}, warn: captureWarn });
  expect(cfg.model).toBe("gpt-4o");
});

test("F5 P1: provider with surrounding whitespace is trimmed", () => {
  writeUserConfig(`provider = "  openai  "\nmodel = "gpt-4o"\n`);
  const cfg = loadConfig(undefined, { home, env: {}, warn: captureWarn });
  expect(cfg.provider).toBe("openai");
});

test("F5 P1: base_url with surrounding whitespace is trimmed", () => {
  writeUserConfig(`base_url = "  https://example.com/v1  "\n`);
  const cfg = loadConfig(undefined, { home, env: {}, warn: captureWarn });
  expect(cfg.baseURL).toBe("https://example.com/v1");
});
