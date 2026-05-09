// G5.5 — /model command behaviour.

import { expect, test } from "bun:test";
import model from "../../src/cmds/model.ts";
import type { CommandContext } from "../../src/types.ts";

function ctx(over: Partial<CommandContext> = {}): CommandContext {
  return {
    args: over.args ?? [],
    state: over.state ?? {},
    session: over.session ?? { model: "deepseek-chat" },
  };
}

test("/model with no args lists every visible provider (mikan hidden)", async () => {
  const r = await model.handle(ctx());
  expect(r.kind).toBe("text");
  const text = r.payload.text ?? "";
  // mikan is hidden — listProviders() filters it. Spot-check the protocol
  // families that should still surface in the picker.
  expect(text).not.toContain("mikan/");
  expect(text).toContain("deepseek/deepseek-v4-flash");
  expect(text).toContain("openai/gpt-4o");
  expect(text).toContain("anthropic/");
  expect(text).toContain("google/");
  expect(text).toContain("ollama/");
});

test("/model output includes the current selection", async () => {
  const r = await model.handle(
    ctx({
      state: { currentProvider: "openai" },
      session: { model: "gpt-4o-mini" },
    }),
  );
  expect(r.payload.text).toContain("current: openai/gpt-4o-mini");
});

test("/model with a known model id switches and emits switch-model", async () => {
  const session = { model: "deepseek-chat" };
  const state: Record<string, unknown> = {};
  const r = await model.handle(ctx({ args: ["gpt-4o"], state, session }));
  expect(r.kind).toBe("action");
  expect(r.payload.action).toBe("switch-model");
  expect(r.payload.data).toEqual({ provider: "openai", model: "gpt-4o" });
  expect(session.model).toBe("gpt-4o");
  expect(state.currentProvider).toBe("openai");
});

test("/model with explicit <provider>/<model> overrides routing", async () => {
  const session = { model: "x" };
  const state: Record<string, unknown> = {};
  const r = await model.handle(
    ctx({ args: ["openrouter/anthropic/claude-3-5-haiku"], state, session }),
  );
  expect(r.kind).toBe("action");
  expect(r.payload.data).toEqual({
    provider: "openrouter",
    model: "anthropic/claude-3-5-haiku",
  });
  expect(session.model).toBe("anthropic/claude-3-5-haiku");
});

test("/model rejects unknown model with an error message", async () => {
  const session = { model: "deepseek-chat" };
  const r = await model.handle(
    ctx({ args: ["totally-unknown-zzz"], state: {}, session }),
  );
  expect(r.kind).toBe("text");
  expect(r.payload.text).toContain("unknown model");
  expect(session.model).toBe("deepseek-chat");
});

test("/model claude-* routes to anthropic", async () => {
  const r = await model.handle(ctx({ args: ["claude-sonnet-4-5"] }));
  expect((r.payload.data as { provider: string }).provider).toBe("anthropic");
});

test("/model gemini-* routes to google", async () => {
  const r = await model.handle(ctx({ args: ["gemini-2.0-flash-exp"] }));
  expect((r.payload.data as { provider: string }).provider).toBe("google");
});
