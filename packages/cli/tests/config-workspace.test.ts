import { expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { loadCliConfig } from "../src/index.ts";

test("CLI config loader includes the workspace project overlay", () => {
  const home = mkdtempSync(join(tmpdir(), "openseek-cli-home-"));
  const workspace = mkdtempSync(join(tmpdir(), "openseek-cli-ws-"));
  try {
    mkdirSync(join(home, ".openseek"), { recursive: true });
    writeFileSync(
      join(home, ".openseek", "config.toml"),
      `provider = "mikan"\nmodel = "deepseek-v4-flash"\napi_key = "sk-user"\n`,
    );
    mkdirSync(join(workspace, ".openseek"), { recursive: true });
    writeFileSync(join(workspace, ".openseek", "config.toml"), `model = "deepseek-v4-pro"\n`);

    const cfg = loadCliConfig(workspace, { home, env: {}, warn: () => {} });

    expect(cfg.provider).toBe("mikan");
    expect(cfg.model).toBe("deepseek-v4-pro");
    expect(cfg.apiKey).toBe("sk-user");
    expect(cfg.source.model).toBe("project");
  } finally {
    rmSync(home, { recursive: true, force: true });
    rmSync(workspace, { recursive: true, force: true });
  }
});
