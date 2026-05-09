import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, test } from "bun:test";
import { memoryFilePath } from "../src/index.ts";

describe("paths", () => {
  const realHomedir = os.homedir;
  afterEach(() => {
    (os as unknown as { homedir: typeof os.homedir }).homedir = realHomedir;
  });

  test("global path resolves under homedir/.openseek/memory.md", () => {
    (os as unknown as { homedir: () => string }).homedir = () => "/tmp/fake-home";
    const p = memoryFilePath("global");
    expect(p).toBe(path.join("/tmp/fake-home", ".openseek", "memory.md"));
  });

  test("workspace path resolves under <workspace>/.openseek/memory.md", () => {
    const p = memoryFilePath("workspace", "/some/project");
    expect(p).toBe(path.join("/some/project", ".openseek", "memory.md"));
  });

  test("workspace scope without workspace arg throws", () => {
    expect(() => memoryFilePath("workspace")).toThrow(/workspace/);
    expect(() => memoryFilePath("workspace", "")).toThrow(/workspace/);
  });
});
