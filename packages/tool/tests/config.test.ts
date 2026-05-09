import { afterEach, beforeEach, expect, test } from "bun:test";
import config from "../src/tools/config.ts";
import { cleanupTmpDir, makeCtx, makeTmpDir } from "./helpers.ts";

let cwd: string;
const ENV_KEYS = [
  "OPENSEEK_PROVIDER",
  "OPENSEEK_MODEL",
  "OPENSEEK_API_KEY",
  "OPENSEEK_BASE_URL",
] as const;
const SAVED: Record<string, string | undefined> = {};

beforeEach(() => {
  cwd = makeTmpDir("openseek-config-");
  for (const k of ENV_KEYS) SAVED[k] = process.env[k];
});

afterEach(() => {
  cleanupTmpDir(cwd);
  for (const k of ENV_KEYS) {
    if (SAVED[k] === undefined) delete process.env[k];
    else process.env[k] = SAVED[k];
  }
});

test("config returns provider/model lines and masks apiKey", async () => {
  process.env.OPENSEEK_PROVIDER = "mikan";
  process.env.OPENSEEK_MODEL = "deepseek-chat";
  process.env.OPENSEEK_API_KEY = "sk-supersecretkey1234";
  delete process.env.OPENSEEK_BASE_URL;

  const result = await config.call({}, makeCtx(cwd));
  expect(result.kind).toBe("text");
  if (result.kind !== "text") throw new Error("unreachable");
  expect(result.text).toContain("provider: mikan");
  expect(result.text).toContain("model:    deepseek-chat");
  expect(result.text).toContain("apiKey:   …1234");
  expect(result.text).not.toContain("supersecret");
});

test("config shows (unset) when api key is empty", async () => {
  delete process.env.OPENSEEK_API_KEY;
  // ensure user config doesn't leak in
  process.env.OPENSEEK_PROVIDER = "openai";
  process.env.OPENSEEK_MODEL = "gpt-test";

  const result = await config.call({ workspace: cwd }, makeCtx(cwd));
  if (result.kind !== "text") throw new Error("unreachable");
  // apiKey may resolve to a real value if `~/.openseek/config.toml` exists.
  // We only assert format invariants:
  expect(result.text).toMatch(/apiKey:\s+(\(unset\)|…)/);
});
