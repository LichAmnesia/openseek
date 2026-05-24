<div align="center">

# OpenSeek · 广度求索

### Open-source TUI coding agent — multi-provider, MCP, LSP, Plan/Agent/YOLO modes

[![Version](https://img.shields.io/github/v/release/LichAmnesia/openseek?color=blue&label=version)](https://github.com/LichAmnesia/openseek/releases)
[![License](https://img.shields.io/github/license/LichAmnesia/openseek?color=green)](./LICENSE)
[![Platform](https://img.shields.io/badge/platform-macOS%20%7C%20Linux%20%7C%20WSL2-lightgrey.svg)](#requirements)
[![Built with Bun](https://img.shields.io/badge/built%20with-Bun%201.3-orange.svg)](https://bun.sh)
[![Stars](https://img.shields.io/github/stars/LichAmnesia/openseek?style=social)](https://github.com/LichAmnesia/openseek)

### 🌐 Website: **[openseek.dev](https://openseek.dev/)**

English | [中文](./README-zh.md)

</div>

## ❤️ Sponsor

> Want to appear here? Open an issue.

<table>
<tr>
<td width="180"><a href="https://relayrouter.io/register?aff=BZP9UY6W9CBZ"><strong>RelayRouter</strong></a></td>
<td>Thanks to <a href="https://relayrouter.io/register?aff=BZP9UY6W9CBZ">RelayRouter</a> for sponsoring this project! RelayRouter is a multi-protocol AI API relay — one key, many models. It speaks <strong>both</strong> the OpenAI <code>/v1/chat/completions</code> and Anthropic <code>/v1/messages</code> wire protocols and dispatches by API-key group: Claude · GPT-5.x · Codex · Gemini · DeepSeek · Kimi · MiniMax — at <strong>0.5×–5.5× upstream pricing</strong> depending on the group. OpenSeek ships first-class support via two built-in providers (<code>relayrouter</code> + <code>relayrouter-anthropic</code>), pinned to the top of the picker. <a href="https://relayrouter.io/register?aff=BZP9UY6W9CBZ">Register here</a> to get started.</td>
</tr>
</table>

## Why OpenSeek?

Modern AI coding tools — Claude Code, Codex, Cursor — are great but closed-source and lock you to specific providers. **OpenSeek** gives you the same agentic terminal experience, open-source, with full BYOK freedom across **27 built-in providers** and a transparent cost meter.

- **27 built-in providers** — OpenAI-compat (Mikan, DeepSeek, OpenRouter, Groq, Fireworks, NVIDIA NIM, Together, Cerebras, DeepInfra, Perplexity, Mistral, xAI, Cohere, Vercel Gateway, Novita, SGLang, vLLM, **RelayRouter**), Anthropic-protocol (Anthropic, Bedrock, Vertex, Azure Foundry, **RelayRouter-Anthropic**), Google (Gemini, Vertex), and local (Ollama, custom)
- **50+ tools, 100+ slash commands** — file ops, shell, web search, MCP fan-out, plan-mode tree, sub-agents, RLM
- **Plan / Agent / YOLO modes** — read-only planning → confirmed execution → full autonomy
- **MCP client** — stdio / SSE / websocket transports, 1-click skills/server install
- **LSP feedback** — `tsserver`, `rust-analyzer`, `pyright`, `gopls`, … inline diagnostics during edits
- **Headless HTTP/SSE runtime API** — `openseek serve --http` for IDE bridges & CI
- **Cost meter** — per-model `$/Mtok` pricing, real-time spend tracking, cache-hit accounting

## Requirements

- macOS or Linux (Windows: use WSL2)
- [Bun](https://bun.sh) ≥ 1.3 — **required at runtime, not optional.** The codebase uses `Bun.spawn` / `Bun.serve` / `Bun.file`; node alone cannot run it. Even if you install via `npm i -g`, the `openseek` command shells out to `bun` at startup and will fail with `env: bun: No such file or directory` if bun is not on your PATH.

## Quick Start

### 1. Install bun (skip if already installed)

```bash
curl -fsSL https://bun.sh/install | bash   # any Unix
brew install oven-sh/bun/bun               # macOS (Homebrew)
```

Verify: `bun --version` should print ≥ `1.3.0`.

### 2. Install openseek

Pick one. All three put `openseek` on your PATH.

```bash
# A. npm
npm install -g openseek

# B. bun (same registry as A, smoother if you already use bun)
bun add -g openseek

# C. From source (recommended while iterating)
git clone https://github.com/LichAmnesia/openseek.git
cd openseek
bun install
bun run build
ln -sf "$PWD/bin/openseek" ~/.local/bin/openseek
```

### 3. Run

```bash
openseek               # start the TUI
openseek setup         # first-run wizard — pick provider + paste API key
openseek doctor        # print resolved config + per-field source layer
openseek serve --http  # headless HTTP/SSE on :7117
```

### 4. Pick a provider (RelayRouter recommended)

The fastest way to try every model family from one key: register a [RelayRouter](https://relayrouter.io/register?aff=BZP9UY6W9CBZ) account, copy the key, pick a group on the dashboard, and point OpenSeek at it.

```bash
# Claude family — key on a "Claude" group (e.g. Claude 2x)
OPENSEEK_PROVIDER=relayrouter-anthropic \
OPENSEEK_API_KEY=sk-... \
OPENSEEK_MODEL=claude-sonnet-4-6 \
  openseek

# GPT / Codex — key on the "Codex 0.75x" group (most permissive)
OPENSEEK_PROVIDER=relayrouter \
OPENSEEK_API_KEY=sk-... \
OPENSEEK_MODEL=gpt-5.4 \
  openseek
```

→ [Sign up here](https://relayrouter.io/register?aff=BZP9UY6W9CBZ) to get RelayRouter credit.

## Configuration

OpenSeek resolves each setting (provider / model / API key / base URL) from the highest layer that defines it. Higher layers override lower ones.

| # | Layer | Location | Notes |
|---|---|---|---|
| 1 | **env** | `OPENSEEK_PROVIDER`, `OPENSEEK_MODEL`, `OPENSEEK_API_KEY`, `OPENSEEK_BASE_URL` | Plus provider-specific keys (`DEEPSEEK_API_KEY`, `ANTHROPIC_API_KEY`, etc.) |
| 2 | **project overlay** | `<workspace>/.openseek/config.toml` | Sandboxed — only `model` is honored. `api_key` / `base_url` / `provider` are silently dropped so a checked-in overlay can't leak secrets or hijack the provider. |
| 3 | **user config** | `~/.openseek/config.toml` | Persisted by the first-run wizard (`openseek setup`). 0600 perms. |
| 4 | **default** | hard-coded fallbacks | What ships in the binary. |

Run `openseek doctor` to see exactly where each value resolved from:

```
$ openseek doctor

Resolved configuration:
  provider   deepseek                       ← user (~/.openseek/config.toml)
  model      deepseek-v4-flash              ← user (~/.openseek/config.toml)
  api_key    sk-a…b8e2                      ← env
  base_url   (provider default)             ← built-in default

Precedence (highest first):
  1. env       OPENSEEK_PROVIDER / OPENSEEK_MODEL / OPENSEEK_API_KEY / OPENSEEK_BASE_URL
  2. project   <workspace>/.openseek/config.toml  (model only — secrets ignored)
  3. user      ~/.openseek/config.toml
  4. default   built-in fallbacks
```

Inside the TUI, `/help` lists all slash commands grouped by category; `/help <name>` shows details for one command, `/help <category>` filters to a single category (`session` / `config` / `tools` / `git` / `agent` / `skills` / `diagnostics` / `advanced` / …), and `/help all` is a flat list.

## Develop

```bash
bun install
bun run dev          # boots the CLI directly from TypeScript sources, no build needed
```

## Verify

```bash
bun run lint        # biome
bun run typecheck   # tsc --noEmit
bun run test        # bun test
bun run verify      # all three
```

## Repo layout

```
openseek/
├── packages/         14 workspace packages
│   ├── core/         shared leaf utilities
│   ├── provider/     27 provider adapters (Vercel ai SDK)
│   ├── session/      main agent loop + compaction strategies
│   ├── tool/         built-in tool registry
│   ├── command/      slash-command registry
│   ├── tui/          @opentui/solid terminal renderer
│   ├── mcp/          MCP client (stdio / SSE / websocket)
│   ├── skill/        skill loader
│   ├── agent/        sub-agents + RLM fan-out
│   ├── memory/       SessionMemory
│   ├── plugin/       plugin protocol
│   ├── server/       HTTP / SSE runtime API
│   ├── lsp/          LSP client (tsserver, rust-analyzer, pyright, ...)
│   └── cli/          entrypoint
├── scripts/          init / build / lint / typecheck / test / verify
├── tests/            cross-package smoke / e2e / coverage gate
├── install/          curl-bash installer + Brewfile + Nix expression
├── bin/openseek      executable shim
└── package.json      bun workspaces root
```

## Star History

<a href="https://www.star-history.com/#LichAmnesia/openseek&Date">
 <picture>
   <source media="(prefers-color-scheme: dark)" srcset="https://api.star-history.com/svg?repos=LichAmnesia/openseek&type=Date&theme=dark" />
   <source media="(prefers-color-scheme: light)" srcset="https://api.star-history.com/svg?repos=LichAmnesia/openseek&type=Date" />
   <img alt="Star History Chart" src="https://api.star-history.com/svg?repos=LichAmnesia/openseek&type=Date" />
 </picture>
</a>

## License

MIT — see [`LICENSE`](./LICENSE).
