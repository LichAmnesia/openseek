import { test, expect } from "bun:test";
import { parseArgv, HELP_TEXT } from "../src/argv.ts";

test("empty argv → no flags set", () => {
  const r = parseArgv([]);
  expect(r.version).toBe(false);
  expect(r.help).toBe(false);
  expect(r.prompt).toBeUndefined();
  expect(r.provider).toBeUndefined();
  expect(r.model).toBeUndefined();
});

test("--version short-circuits", () => {
  expect(parseArgv(["--version"]).version).toBe(true);
  expect(parseArgv(["-v"]).version).toBe(true);
});

test("--help short-circuits", () => {
  expect(parseArgv(["--help"]).help).toBe(true);
  expect(parseArgv(["-h"]).help).toBe(true);
});

test("-p sets prompt", () => {
  const r = parseArgv(["-p", "do the thing"]);
  expect(r.prompt).toBe("do the thing");
});

test("--prompt sets prompt", () => {
  const r = parseArgv(["--prompt", "another"]);
  expect(r.prompt).toBe("another");
});

test("trailing positional becomes prompt", () => {
  const r = parseArgv(["explain this"]);
  expect(r.prompt).toBe("explain this");
});

test("--provider + --model overrides", () => {
  const r = parseArgv(["--provider", "openai", "--model", "gpt-4o"]);
  expect(r.provider).toBe("openai");
  expect(r.model).toBe("gpt-4o");
});

test("flag after positional does not overwrite", () => {
  const r = parseArgv(["hello", "--provider", "mikan-cloud"]);
  expect(r.prompt).toBe("hello");
  expect(r.provider).toBe("mikan-cloud");
});

test("HELP_TEXT mentions key concepts", () => {
  expect(HELP_TEXT).toContain("OpenSeek");
  expect(HELP_TEXT).toContain("--provider");
  expect(HELP_TEXT).toContain("OPENSEEK_API_KEY");
  expect(HELP_TEXT).toContain("config.toml");
});
