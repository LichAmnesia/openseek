import { existsSync } from "node:fs";
import { join } from "node:path";
import { afterEach, beforeEach, expect, test } from "bun:test";
import enterWorktree from "../src/tools/enter_worktree.ts";
import exitWorktree from "../src/tools/exit_worktree.ts";
import { cleanupTmpDir, makeCtx, makeTmpDir } from "./helpers.ts";

async function gitInit(dir: string): Promise<void> {
  for (const args of [
    ["git", "init", "-q", "-b", "main"],
    ["git", "config", "user.email", "test@example.com"],
    ["git", "config", "user.name", "Test"],
    ["git", "commit", "--allow-empty", "-m", "init", "-q"],
  ]) {
    const proc = Bun.spawn(args, { cwd: dir, stdin: "ignore", stdout: "pipe", stderr: "pipe" });
    const code = await proc.exited;
    if (code !== 0) {
      const err = await new Response(proc.stderr).text();
      throw new Error(`git ${args.slice(1).join(" ")} failed: ${err}`);
    }
  }
}

let repo: string;

beforeEach(async () => {
  repo = makeTmpDir("openseek-exitwt-");
  await gitInit(repo);
});

afterEach(() => {
  cleanupTmpDir(repo);
});

test("exit_worktree without remove returns marker only", async () => {
  const result = await exitWorktree.call({ path: "/tmp/whatever" }, makeCtx(repo));
  expect(result.kind).toBe("text");
  if (result.kind !== "text") throw new Error("unreachable");
  expect(result.text).toContain("worktree exited");
  expect(result.text).not.toContain("removed");
});

test("exit_worktree with remove deletes the worktree directory", async () => {
  const wt = join(repo, "..", "wt-remove");
  await enterWorktree.call({ branch: "rm-branch", path: wt }, makeCtx(repo));
  expect(existsSync(wt)).toBe(true);
  const result = await exitWorktree.call({ path: wt, remove: true }, makeCtx(repo));
  expect(result.kind).toBe("text");
  if (result.kind !== "text") throw new Error("unreachable");
  expect(result.text).toContain("removed");
  expect(existsSync(wt)).toBe(false);
});

test("exit_worktree with remove returns error for unknown path", async () => {
  const result = await exitWorktree.call(
    { path: join(repo, "..", "wt-never-was"), remove: true },
    makeCtx(repo),
  );
  expect(result.kind).toBe("error");
});
