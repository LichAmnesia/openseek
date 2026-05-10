# OpenSeek - 广度求索

> 中文: [README-zh.md](./README-zh.md)
> Website: https://openseek.dev/

Open-source TUI coding agent — a TypeScript / Bun monorepo.

Lightweight terminal coding companion with multi-provider routing
(OpenAI-compatible / Anthropic / Bedrock / Vertex / Azure), 50+ tools,
100+ slash commands, Plan / Agent / YOLO modes, MCP client, LSP feedback,
and a headless HTTP/SSE runtime API.

## Requirements

- macOS or Linux (Windows: use WSL2)
- [Bun](https://bun.sh) ≥ 1.3 — **required at runtime, not optional.** The
  codebase uses `Bun.spawn` / `Bun.serve` / `Bun.file`; node alone cannot run
  it. Even if you install via `npm i -g`, the `openseek` command shells out
  to `bun` at startup and will fail with `env: bun: No such file or directory`
  if bun is not on your PATH.

## Install

### Step 1 — install bun (skip if already installed)

```bash
curl -fsSL https://bun.sh/install | bash   # any Unix
brew install oven-sh/bun/bun               # macOS (Homebrew)
```

Verify: `bun --version` should print ≥ `1.3.0`.

### Step 2 — install openseek

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

### Step 3 — run

```bash
openseek               # start the TUI
openseek doctor        # health check
openseek serve --http  # headless HTTP/SSE on :7117
```

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
│   ├── provider/     25+ provider adapters (Vercel ai SDK)
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

## License

See `LICENSE`.
