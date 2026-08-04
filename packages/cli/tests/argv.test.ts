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

test("format defaults to text", () => {
  expect(parseArgv([]).format).toBe("text");
  expect(parseArgv(["-p", "hi"]).format).toBe("text");
});

test("--format json sets json format", () => {
  expect(parseArgv(["-p", "hi", "--format", "json"]).format).toBe("json");
});

test("--format text is honored", () => {
  expect(parseArgv(["-p", "hi", "--format", "text"]).format).toBe("text");
});

test("--json is shorthand for --format json", () => {
  expect(parseArgv(["-p", "hi", "--json"]).format).toBe("json");
});

test("--format with unknown value falls back to text", () => {
  expect(parseArgv(["-p", "hi", "--format", "xml"]).format).toBe("text");
});

test("HELP_TEXT mentions key concepts", () => {
  expect(HELP_TEXT).toContain("OpenSeek");
  expect(HELP_TEXT).toContain("--provider");
  expect(HELP_TEXT).toContain("OPENSEEK_API_KEY");
  expect(HELP_TEXT).toContain("config.toml");
});

test("--max-steps parses a positive integer", () => {
  expect(parseArgv(["-p", "hi", "--max-steps", "200"]).maxSteps).toBe(200);
});

test("--max-steps rejects non-positive / non-integer values", () => {
  expect(parseArgv(["-p", "hi", "--max-steps", "0"]).maxSteps).toBeUndefined();
  expect(parseArgv(["-p", "hi", "--max-steps", "abc"]).maxSteps).toBeUndefined();
  expect(parseArgv(["-p", "hi", "--max-steps", "1.5"]).maxSteps).toBeUndefined();
});

test("--max-steps absent → undefined (one-shot default applied downstream)", () => {
  expect(parseArgv(["-p", "hi"]).maxSteps).toBeUndefined();
});
