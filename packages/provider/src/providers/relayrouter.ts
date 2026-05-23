// RelayRouter — multi-provider relay at relayrouter.io. The dashboard
// also surfaces a `vip.relayrouter.io` "直连" endpoint, but that requires
// a paid/whitelisted plan; the default endpoint relayrouter.io works for
// all keys. Despite the OpenAI-compat wire, the relay fans out to many
// upstreams (OpenAI / Anthropic / Gemini / DeepSeek / Kimi / Minimax /
// Codex号池 …) selected by the API key's GROUP setting.
//
// Group multipliers (倍率) seen on the keys dashboard:
//   • GPT 0.5x                                          (current cheapest GPT)
//   • OpenAI 稳定版 2.1x
//   • Codex 快速开号池 0.75x
//   • Claude 2x  /  Claude CC 快速号池 2.3x
//   • Claude 官方API 5.5x  /  Claude 兜底策略 5.5x
//   • Claude AWS 分组 5.4x  /  Claude Hermes 专用 5.4x
//   • Claude 快速接号池(kiro) 1.2x
//   • Deepseek 1x  ·  Kimi 1x  ·  Minimax 1x
//   • Gemini Vertex 官方 5.4x  /  Gemini 快速号池 2.72x
//   • image2 1.25x
// The relay bills upstream tokens × the key's group multiplier; our
// PRICING entries store upstream list rates (1x baseline). Real spend =
// PRICING * groupMultiplier. Switch groups on the dashboard, not here.
//
// Smoke-test results (2026-05-22):
//   - All 4 Claude models PASS on Claude 2x via `relayrouter-anthropic`.
//   - GPT family (5.5 / 5.4 / 5.4-mini / 5.2 / 5.3-codex / 5.3-codex-spark)
//     PASSes most reliably on the "Codex 快速开号池 0.75x" group. The
//     "OpenAI 稳定版 2.1x" group serves only gpt-5.4 / gpt-5.5 reliably;
//     other GPT ids hit upstream 502/503 there.
//   - `codex-mini-latest` was NOT provisioned on the relay (5 retries on
//     both Codex and OpenAI groups returned 503) → removed from the list.

import { createOpenAICompatProvider } from "../openai-compat.ts";

export const relayrouterProvider = createOpenAICompatProvider({
  id: "relayrouter",
  baseURL: "https://relayrouter.io/v1",
  defaultModel: "gpt-5.4",
  requiresReasoningReplay: false,
  capability: {
    contextWindow: 1_000_000,
    maxOutput: 128_000,
    supportsThinking: true,
    supportsCacheControl: false,
    supportsToolUse: true,
  },
  availableModels: [
    // ── GPT / Codex (groups: GPT 0.5x · OpenAI 稳定版 2.1x · Codex 0.75x) ──
    { id: "gpt-5.5", label: "GPT-5.5", description: "Frontier · 1M ctx · GPT group" },
    { id: "gpt-5.4", label: "GPT-5.4", description: "Workhorse · 1M ctx · GPT group" },
    { id: "gpt-5.4-mini", label: "GPT-5.4 Mini", description: "Cheap · 400K ctx · GPT group" },
    { id: "gpt-5.3-codex", label: "GPT-5.3 Codex", description: "Codex · 400K ctx · Codex group" },
    { id: "gpt-5.3-codex-spark", label: "GPT-5.3 Codex Spark", description: "Codex fast · 128K · Codex group" },
    { id: "gpt-5.2", label: "GPT-5.2", description: "Stable · 400K ctx · GPT group" },
    // ── Anthropic Claude (groups: Claude 2x ~ 5.5x) ──
    { id: "claude-opus-4-7", label: "Claude Opus 4.7", description: "Frontier · Claude group (~5.5x)" },
    { id: "claude-sonnet-4-6", label: "Claude Sonnet 4.6", description: "Workhorse · Claude group (~2x)" },
    { id: "claude-sonnet-4-5", label: "Claude Sonnet 4.5", description: "Stable · Claude group (~2x)" },
    { id: "claude-haiku-4-5", label: "Claude Haiku 4.5", description: "Cheap · Claude group" },
    // ── Google Gemini (groups: Vertex 5.4x · 快速号池 2.72x) ──
    { id: "gemini-3-pro-preview", label: "Gemini 3 Pro", description: "Frontier · Gemini group" },
    { id: "gemini-3-flash-preview", label: "Gemini 3 Flash", description: "Workhorse · Gemini group" },
    // ── DeepSeek (group: Deepseek 1x) ──
    { id: "deepseek-v4-pro", label: "DeepSeek V4 Pro", description: "Frontier · 1M ctx · DS 1x" },
    { id: "deepseek-v4-flash", label: "DeepSeek V4 Flash", description: "Workhorse · 1M ctx · DS 1x" },
    { id: "deepseek-reasoner", label: "DeepSeek R1", description: "Reasoning · DS 1x" },
    // ── Other (Kimi 1x · Minimax 1x) ──
    { id: "kimi-k2-0905-preview", label: "Kimi K2 (0905)", description: "Moonshot · Kimi 1x" },
    { id: "minimax-text-01", label: "MiniMax Text-01", description: "MiniMax · 1x" },
  ],
  // /fast → drop frontier/workhorse to mini sibling for the next turn.
  fastVariants: {
    "gpt-5.5": "gpt-5.4-mini",
    "gpt-5.4": "gpt-5.4-mini",
    "gpt-5.2": "gpt-5.4-mini",
    "gpt-5.3-codex": "gpt-5.3-codex-spark",
    "claude-opus-4-7": "claude-haiku-4-5",
    "claude-sonnet-4-6": "claude-haiku-4-5",
    "claude-sonnet-4-5": "claude-haiku-4-5",
    "gemini-3-pro-preview": "gemini-3-flash-preview",
    "deepseek-v4-pro": "deepseek-v4-flash",
  },
});
