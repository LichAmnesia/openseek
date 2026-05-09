import { afterEach, beforeEach, expect, test } from "bun:test";
import powershell from "../src/tools/powershell.ts";
import { cleanupTmpDir, makeCtx, makeTmpDir } from "./helpers.ts";

let cwd: string;

beforeEach(() => {
  cwd = makeTmpDir("openseek-powershell-");
});

afterEach(() => {
  cleanupTmpDir(cwd);
});

test("powershell errors on non-Windows hosts with platform mismatch", async () => {
  const result = await powershell.call({ command: "Get-ChildItem" }, makeCtx(cwd));
  if (process.platform === "win32") {
    expect(result.kind).toBe("text");
    return;
  }
  expect(result.kind).toBe("error");
  if (result.kind !== "error") throw new Error("unreachable");
  expect(result.message).toContain("powershell unavailable");
  expect(result.message).toContain(process.platform);
});

test("powershell deny-in-plan permission tag", () => {
  expect(powershell.permission).toBe("deny-in-plan");
  expect(powershell.name).toBe("powershell");
});

test("powershell input schema rejects empty command", () => {
  const parsed = powershell.inputSchema.safeParse({ command: "" });
  expect(parsed.success).toBe(false);
});
