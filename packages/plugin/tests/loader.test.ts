import { test, expect } from "bun:test";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { applyLoaded, loadPlugins } from "../src/loader.ts";
import type { Plugin } from "../src/types.ts";

function withTmp(fn: (root: string) => void | Promise<void>) {
  const root = mkdtempSync(join(tmpdir(), "openseek-plugin-"));
  return Promise.resolve(fn(root)).finally(() => {
    rmSync(root, { recursive: true, force: true });
  });
}

test("inline plugin registers a tool and a command", async () => {
  const plugin: Plugin = {
    name: "openseek-plugin-demo",
    version: "0.1.0",
    register(api) {
      api.addTool({ name: "demo_tool", description: "demo" });
      api.addCommand({
        name: "demo",
        description: "demo command",
        category: "advanced",
        isStub: false,
        handle: () => ({ kind: "text", payload: { text: "ok" } }),
      });
    },
  };
  const r = await loadPlugins({ inline: [plugin] });
  expect(r.plugins.length).toBe(1);
  expect(r.tools.length).toBe(1);
  expect(r.commands.length).toBe(1);
  expect(r.tools[0]?.name).toBe("demo_tool");
});

test("warnings track failing register without aborting", async () => {
  const ok: Plugin = {
    name: "ok-plugin",
    version: "0.0.1",
    register(api) {
      api.addTool({ name: "ok_tool" });
    },
  };
  const bad: Plugin = {
    name: "bad-plugin",
    version: "0.0.1",
    register() {
      throw new Error("boom");
    },
  };
  const r = await loadPlugins({ inline: [ok, bad] });
  expect(r.plugins.length).toBe(1);
  expect(r.tools.length).toBe(1);
  expect(r.warnings.length).toBe(1);
  expect(r.warnings[0]?.source).toBe("bad-plugin");
});

test("filesystem scan picks up an openseek-plugin-* package via importer override", async () => {
  await withTmp(async (root) => {
    const modules = join(root, "node_modules");
    const pkgDir = join(modules, "openseek-plugin-foo");
    mkdirSync(pkgDir, { recursive: true });
    writeFileSync(
      join(pkgDir, "package.json"),
      JSON.stringify({ name: "openseek-plugin-foo", version: "1.2.3" }),
    );
    const r = await loadPlugins({
      dirs: [modules],
      importer: async () => ({
        default: {
          name: "openseek-plugin-foo",
          version: "1.2.3",
          register(api: { addTool: (t: { name: string }) => void }) {
            api.addTool({ name: "foo_tool" });
          },
        },
      }),
    });
    expect(r.plugins.map((p) => p.name)).toEqual(["openseek-plugin-foo"]);
    expect(r.tools.map((t) => t.name)).toEqual(["foo_tool"]);
  });
});

test("non-prefixed packages in node_modules are skipped", async () => {
  await withTmp(async (root) => {
    const modules = join(root, "node_modules");
    mkdirSync(join(modules, "regular-pkg"), { recursive: true });
    const r = await loadPlugins({
      dirs: [modules],
      importer: async () => {
        throw new Error("should not be invoked");
      },
    });
    expect(r.plugins.length).toBe(0);
  });
});

test("applyLoaded merges tool/command lists", () => {
  const merged = applyLoaded([{ name: "a" }], [], {
    plugins: [],
    tools: [{ name: "b" }],
    commands: [{ name: "x", handle: () => null }],
    warnings: [],
  });
  expect(merged.tools.map((t) => t.name)).toEqual(["a", "b"]);
  expect(merged.commands.map((c) => c.name)).toEqual(["x"]);
});

test("missing dir does not error", async () => {
  const r = await loadPlugins({ dirs: ["/non/existent/path"] });
  expect(r.plugins.length).toBe(0);
  expect(r.warnings.length).toBe(0);
});
