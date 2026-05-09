# OpenSeek

Open-source TUI coding agent — a TypeScript / Bun monorepo.

Lightweight terminal coding companion with multi-provider routing
(OpenAI-compatible / Anthropic / Bedrock / Vertex / Azure), 50+ tools,
100+ slash commands, Plan / Agent / YOLO modes, MCP client, LSP feedback,
and a headless HTTP/SSE runtime API.

## Requirements

- [Bun](https://bun.sh) ≥ 1.3
- macOS or Linux (Windows: use WSL2)

Install Bun if you don't have it:

```bash
brew install oven-sh/bun/bun       # macOS (Homebrew)
curl -fsSL https://bun.sh/install | bash   # any Unix
```

## Quickstart (from source)

```bash
git clone https://github.com/<your-handle>/openseek.git
cd openseek
bun install
bun run dev          # launch the TUI
```

That's it — `bun run dev` boots the CLI directly from TypeScript sources via
Bun, no build step needed for development.

## Build a launcher

To install the `openseek` command on your PATH:

```bash
bun run build                                    # produces ./bin/openseek
ln -sf "$PWD/bin/openseek" ~/.local/bin/openseek # symlink onto PATH
openseek                                         # start the TUI
openseek doctor                                  # health check
openseek serve --http                            # headless HTTP/SSE on :7117
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

## Inspiration (read-only references, not forks)

- [opencode](https://github.com/sst/opencode) — provider abstraction + Solid TUI pattern
- DeepSeek-TUI — RLM parallel sub-models + cache-aware compaction
- Claude Code — tool & slash-command design space

All code is independently authored.

## License

See `LICENSE`.
