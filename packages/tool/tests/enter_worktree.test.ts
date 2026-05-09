import { existsSync } from "node:fs";
import { join } from "node:path";
import { afterEach, beforeEach, expect, test } from "bun:test";
import enterWorktree from "../src/tools/enter_worktree.ts";
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
  repo = makeTmpDir("openseek-worktree-");
  await gitInit(repo);
});

afterEach(() => {
  cleanupTmpDir(repo);
});

test("enter_worktree creates a real git worktree directory", async () => {
  const wt = join(repo, "..", "wt-feature");
  const result = await enterWorktree.call(
    { branch: "feature-x", path: wt },
    makeCtx(repo),
  );
  expect(result.kind).toBe("text");
  if (result.kind !== "text") throw new Error("unreachable");
  expect(result.text).toContain("entered");
  expect(result.text).toContain("feature-x");
  expect(existsSync(wt)).toBe(true);
  // cleanup the worktree path for the next test
  const proc = Bun.spawn(["git", "worktree", "remove", "--force", wt], {
    cwd: repo,
    stdin: "ignore",
    stdout: "pipe",
    stderr: "pipe",
  });
  await proc.exited;
});

test("enter_worktree returns error outside a git repo", async () => {
  const nonRepo = makeTmpDir("openseek-not-a-repo-");
  const result = await enterWorktree.call(
    { branch: "x", path: join(nonRepo, "wt") },
    makeCtx(nonRepo),
  );
  expect(result.kind).toBe("error");
  cleanupTmpDir(nonRepo);
});

test("enter_worktree fails on duplicate branch", async () => {
  const wt1 = join(repo, "..", "wt-dup-1");
  await enterWorktree.call({ branch: "dup-branch", path: wt1 }, makeCtx(repo));
  const wt2 = join(repo, "..", "wt-dup-2");
  const result = await enterWorktree.call(
    { branch: "dup-branch", path: wt2 },
    makeCtx(repo),
  );
  expect(result.kind).toBe("error");
  // cleanup
  const proc = Bun.spawn(["git", "worktree", "remove", "--force", wt1], {
    cwd: repo,
    stdin: "ignore",
    stdout: "pipe",
    stderr: "pipe",
  });
  await proc.exited;
});
