import { test, expect } from "bun:test";
import { builtinCommands } from "../src/index.ts";
import type { Command, CommandContext } from "../src/types.ts";

function find(name: string): Command {
  const c = builtinCommands.find((c) => c.name === name);
  if (!c) throw new Error(`command not found: ${name}`);
  return c;
}

type SessionLike = NonNullable<CommandContext["session"]>;

function freshSession(over: Partial<SessionLike> = {}): SessionLike {
  return {
    messages: [],
    model: "test-model",
    effort: "medium",
    mode: "agent",
    theme: "default",
    outputStyle: "default",
    vimEnabled: false,
    ...over,
  };
}

// ── session category ──

test("/clear empties messages and returns clear-history action", async () => {
  const session = freshSession({ messages: [{ role: "user" }, { role: "assistant" }] });
  const r = await find("clear").handle({ session });
  expect(r.kind).toBe("action");
  expect(r.payload.action).toBe("clear-history");
  expect(session.messages?.length).toBe(0);
});

test("/compact reports message count and strategy", async () => {
  const r = await find("compact").handle({
    session: freshSession({ messages: [{}, {}, {}] }),
  });
  expect(r.payload.action).toBe("compact-session");
  expect((r.payload.data as { messageCount: number }).messageCount).toBe(3);
});

test("/summary includes model and message count", async () => {
  const r = await find("summary").handle({
    session: freshSession({ messages: [{}], model: "gpt" }),
  });
  expect(r.kind).toBe("text");
  expect(r.payload.text).toContain("gpt");
});

test("/fast toggles fastMode", async () => {
  const state: Record<string, unknown> = {};
  await find("fast").handle({ state });
  expect(state.fastMode).toBe(true);
  await find("fast").handle({ state });
  expect(state.fastMode).toBe(false);
});

test("/exit emits exit action", async () => {
  const r = await find("exit").handle({});
  expect(r.payload.action).toBe("exit");
});

test("/session prints state lines", async () => {
  const r = await find("session").handle({ session: freshSession() });
  expect(r.payload.text).toContain("model:");
});

test("/share reports message count", async () => {
  const r = await find("share").handle({ session: freshSession({ messages: [{}, {}] }) });
  expect(r.payload.text).toContain("2 message");
});

test("/copy returns copy-last action", async () => {
  const r = await find("copy").handle({ session: freshSession({ messages: [{ role: "assistant" }] }) });
  expect(r.payload.action).toBe("copy-last");
});

test("/diff returns text without spawn", async () => {
  const r = await find("diff").handle({});
  expect(r.kind).toBe("text");
});

// ── config category ──

test("/config dumps key fields", async () => {
  const r = await find("config").handle({ session: freshSession({ theme: "dark" }) });
  expect(r.payload.text).toContain("theme:");
  expect(r.payload.text).toContain("dark");
});

test("/model with arg sets the session model", async () => {
  const session = freshSession();
  const r = await find("model").handle({ args: ["claude-4"], session });
  expect(r.payload.action).toBe("switch-model");
  expect(session.model).toBe("claude-4");
});

test("/model without arg prints current", async () => {
  const r = await find("model").handle({ session: freshSession({ model: "x" }) });
  expect(r.payload.text).toContain("x");
});

test("/effort cycles low → medium → high → low", async () => {
  const session = freshSession({ effort: "low" });
  await find("effort").handle({ session });
  expect(session.effort).toBe("medium");
  await find("effort").handle({ session });
  expect(session.effort).toBe("high");
  await find("effort").handle({ session });
  expect(session.effort).toBe("low");
});

test("/permissions returns matrix for current mode", async () => {
  const r = await find("permissions").handle({ session: freshSession({ mode: "plan" }) });
  expect(r.payload.text).toContain("plan");
  expect((r.payload.data as { allowed: string[] }).allowed).toContain("read");
});

test("/keybindings lists common shortcuts", async () => {
  const r = await find("keybindings").handle({});
  expect(r.payload.text).toContain("ctrl+c");
});

test("/theme set to known theme updates session", async () => {
  const session = freshSession();
  const r = await find("theme").handle({ args: ["dark"], session });
  expect(r.payload.action).toBe("set-theme");
  expect(session.theme).toBe("dark");
});

test("/output-style set updates session", async () => {
  const session = freshSession();
  await find("output-style").handle({ args: ["pirate"], session });
  expect(session.outputStyle).toBe("pirate");
});

test("/vim toggles vim flag", async () => {
  const session = freshSession();
  await find("vim").handle({ session });
  expect(session.vimEnabled).toBe(true);
});

test("/color rejects unknown mode", async () => {
  const r = await find("color").handle({ args: ["fancy"] });
  expect(r.payload.text).toContain("bad mode");
});

test("/env lists watched keys", async () => {
  const r = await find("env").handle({});
  expect(r.payload.text).toContain("OPENSEEK_HOME");
});

// ── auth category ──

test("/logout clears state.token + state.account", async () => {
  const state: Record<string, unknown> = { token: "abc", account: "u" };
  await find("logout").handle({ state });
  expect(state.token).toBeUndefined();
  expect(state.account).toBeUndefined();
});

test("/account shows anonymous by default + flags v1.0 subsystem", async () => {
  // T6 anti-lie: empty state must say "(anonymous)" AND mark itself as a
  // v1.0 subsystem placeholder so users don't think they're logged out by
  // accident.
  const r = await find("account").handle({});
  const text = r.payload.text ?? "";
  expect(text).toContain("anonymous");
  expect(text).toMatch(/v1\.0|subsystem/i);
});

test("/usage reads counters from state (UsageDisplay shape: totalIn/totalOut/cacheRead)", async () => {
  // Pre-fix the test asserted `{input,output,cacheRead}` — the wrong
  // shape — and the cli host therefore wired the right shape into the
  // wrong field names (always 0). Aligned to UsageDisplay.
  const r = await find("usage").handle({
    state: { usage: { totalIn: 100, totalOut: 50, cacheRead: 0 } },
  });
  expect(r.payload.text).toContain("100");
  expect(r.payload.text).toContain("50");
});

test("/cost computes USD from state.usage via real per-model pricing (no hardcoded $3/$15)", async () => {
  // 1M input + 1M output @ sonnet 4.6 ($3/$15) = $18.
  const r = await find("cost").handle({
    state: { usage: { totalIn: 1_000_000, totalOut: 1_000_000 } },
    session: { model: "claude-sonnet-4-6" },
  });
  const usd = (r.payload.data as { usd: number }).usd;
  expect(usd).toBeCloseTo(18, 5);
});

test("/cost: $0 when no tokens have been consumed yet (no model lookup needed)", async () => {
  const r = await find("cost").handle({ state: {} });
  expect(r.payload.text).toContain("$0");
});

test("/cost: clear error when model id is unset but tokens exist", async () => {
  const r = await find("cost").handle({
    state: { usage: { totalIn: 100, totalOut: 100 } },
    session: {},
  });
  expect(r.payload.text).toContain("model");
});

test("/stats reports zeros on empty state", async () => {
  const r = await find("stats").handle({});
  expect(r.payload.text).toContain("turns=0");
});

// ── tools category ──

test("/add-dir adds a directory to the allowlist", async () => {
  const state: Record<string, unknown> = {};
  await find("add-dir").handle({ args: ["/tmp"], state });
  const list = state.allowedDirs as string[];
  expect(list).toContain("/tmp");
});

test("/files returns matches array", async () => {
  const r = await find("files").handle({ args: ["package.json"], cwd: process.cwd() });
  expect((r.payload.data as { count: number }).count).toBeGreaterThanOrEqual(0);
});

test("/context approximates token usage", async () => {
  const r = await find("context").handle({ session: freshSession({ messages: [{}, {}] }) });
  expect((r.payload.data as { approxTokens: number }).approxTokens).toBe(400);
});

test("/break-cache flips state.breakCache", async () => {
  const state: Record<string, unknown> = {};
  await find("break-cache").handle({ state });
  expect(state.breakCache).toBe(true);
});

// ── git category (no spawn injected, plan/error path) ──

test("/branch without spawn returns text", async () => {
  const r = await find("branch").handle({});
  expect(r.kind).toBe("text");
});

test("/commit without args asks for usage", async () => {
  const r = await find("commit").handle({ spawn: async () => ({ stdout: "", stderr: "", exitCode: 0 }) });
  expect(r.payload.text).toContain("usage");
});

test("/commit-push-pr without spawn shows plan", async () => {
  const r = await find("commit-push-pr").handle({ args: ["msg"] });
  expect(r.payload.text).toContain("git commit");
});

test("/tag without spawn returns text", async () => {
  const r = await find("tag").handle({});
  expect(r.kind).toBe("text");
});

test("/rename rejects missing args", async () => {
  const r = await find("rename").handle({
    spawn: async () => ({ stdout: "", stderr: "", exitCode: 0 }),
  });
  expect(r.payload.text).toContain("usage");
});

// ── agent category ──

test("/plan switches mode to plan", async () => {
  const session = freshSession();
  await find("plan").handle({ session });
  expect(session.mode).toBe("plan");
});

test("/agents on empty registry shows honest fallback (no fake hard-coded list)", async () => {
  // T5: pre-fix this rendered ["general","code","research","debug"] —
  // none of those names map to real sub-agent profiles. Honest fallback now.
  const r = await find("agents").handle({});
  const text = r.payload.text ?? "";
  expect(text).not.toContain("general");
  expect(text).not.toContain("research");
  expect(text).toMatch(/v1\.0|registered|registry/i);
});

test("/agents reads ctx.state.agents when a real registry is wired", async () => {
  const r = await find("agents").handle({ state: { agents: ["coder", "auditor"] } });
  expect(r.payload.text).toContain("coder");
  expect(r.payload.text).toContain("auditor");
});

test("/tasks reports empty by default + flags v1.0 subsystem (T6 anti-lie)", async () => {
  const r = await find("tasks").handle({});
  const text = r.payload.text ?? "";
  expect(text).toContain("no tasks");
  expect(text).toMatch(/v1\.0|subsystem/i);
});

// ── skills category ──

test("/skills install <spec> emits install-skill action", async () => {
  const r = await find("skills").handle({ args: ["install", "octocat/Hello-World"] });
  expect(r.payload.action).toBe("install-skill");
});

test("/plugin reports empty list + flags v1.0 subsystem (T6 anti-lie)", async () => {
  const r = await find("plugin").handle({});
  const text = r.payload.text ?? "";
  expect(text).toContain("no plugins");
  expect(text).toMatch(/v1\.0|subsystem/i);
});

test("/mcp reports empty list + flags v1.0 subsystem (T6 anti-lie)", async () => {
  const r = await find("mcp").handle({});
  const text = r.payload.text ?? "";
  expect(text).toContain("no MCP");
  expect(text).toMatch(/v1\.0|subsystem/i);
});

test("/init creates .openseek directory", async () => {
  const fs = await import("node:fs");
  const os = await import("node:os");
  const { join } = await import("node:path");
  const tmp = fs.mkdtempSync(join(os.tmpdir(), "openseek-init-"));
  try {
    const r = await find("init").handle({ cwd: tmp });
    expect((r.payload.data as { root: string }).root).toBe(join(tmp, ".openseek"));
    expect(fs.existsSync(join(tmp, ".openseek", "skills"))).toBe(true);
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
});

// ── diagnostics category ──

test("/doctor reports checks structure", async () => {
  const r = await find("doctor").handle({});
  expect((r.payload.data as { checks: unknown[] }).checks.length).toBeGreaterThan(0);
});

test("/status prints pid", async () => {
  const r = await find("status").handle({});
  expect(r.payload.text).toContain("pid:");
});

test("/version prints version string", async () => {
  const r = await find("version").handle({});
  expect(r.payload.text).toContain("openseek");
});

test("/help with unknown command says unknown", async () => {
  const r = await find("help").handle({ args: ["nope"], state: { allCommands: [] } });
  expect(r.payload.text).toContain("unknown");
});

test("/help lists ALL registered commands (no 20-row truncation)", async () => {
  const many = Array.from({ length: 108 }, (_, i) => ({
    name: `cmd-${i.toString().padStart(3, "0")}`,
    description: `command number ${i}`,
    category: "advanced" as const,
  }));
  const r = await find("help").handle({ state: { allCommands: many } });
  const text = r.payload.text ?? "";
  // Spot-check first, last, and an arbitrary mid command (past the old 20-row cap).
  expect(text).toContain("/cmd-000");
  expect(text).toContain("/cmd-050");
  expect(text).toContain("/cmd-107");
  expect(text).toContain("108 commands total");
});

test("/help groups by category and lists each section", async () => {
  const all = [
    { name: "model", description: "switch model", category: "config" as const },
    { name: "clear", description: "clear transcript", category: "session" as const },
    { name: "exit", description: "quit", category: "session" as const },
  ];
  const r = await find("help").handle({ state: { allCommands: all } });
  const text = r.payload.text ?? "";
  expect(text).toContain("Session");
  expect(text).toContain("Config");
  expect(text).toContain("/model");
  expect(text).toContain("/clear");
});

test("/help <category> filters to that category", async () => {
  const all = [
    { name: "model", description: "switch model", category: "config" as const },
    { name: "clear", description: "clear transcript", category: "session" as const },
  ];
  const r = await find("help").handle({ args: ["session"], state: { allCommands: all } });
  const text = r.payload.text ?? "";
  expect(text).toContain("/clear");
  expect(text).not.toContain("/model");
  expect(text).toContain("in /session");
});

test("/help all returns a flat list", async () => {
  const all = [
    { name: "model", description: "switch model", category: "config" as const },
    { name: "clear", description: "clear transcript", category: "session" as const },
  ];
  const r = await find("help").handle({ args: ["all"], state: { allCommands: all } });
  const text = r.payload.text ?? "";
  expect(text).toContain("/model");
  expect(text).toContain("/clear");
  expect(text).not.toContain("Session\n");
  expect(text).toContain("2 commands total");
});

test("/upgrade signals no upstream registry", async () => {
  const r = await find("upgrade").handle({});
  expect(r.payload.text).toContain("no-op");
});

// ── advanced category ──

test("/memory reports no memory by default", async () => {
  const r = await find("memory").handle({});
  expect(r.payload.text).toContain("no memory");
});

test("/brief includes msgs count", async () => {
  const r = await find("brief").handle({ session: freshSession({ messages: [{}, {}] }) });
  expect(r.payload.text).toContain("2 msgs");
});

test("/src returns the source URL", async () => {
  const r = await find("src").handle({});
  expect(r.payload.text).toContain("github.com");
});

test("/history reports counts", async () => {
  const r = await find("history").handle({
    session: freshSession({ messages: [{ role: "user" }, { role: "user" }, { role: "assistant" }] }),
  });
  expect((r.payload.data as Record<string, number>).user).toBe(2);
});

test("/debug toggles debug flag", async () => {
  const state: Record<string, unknown> = {};
  await find("debug").handle({ state });
  expect(state.debug).toBe(true);
});

// ── stub coverage ──

test("a stub command returns the standard message", async () => {
  const stub = builtinCommands.find((c) => c.isStub);
  if (!stub) throw new Error("expected at least one stub command");
  const r = await stub.handle({});
  expect(r.payload.text).toContain("v1.0 will implement");
});
