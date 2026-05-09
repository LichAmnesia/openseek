#!/usr/bin/env bash
# Idempotent: create package.json + src/index.ts + tests/ + README.md for each package.
# Run again after pulling — only fills in missing files.

set -euo pipefail

declare -a PACKAGES=(
  "core:Shared leaf utilities (log/hash/glob/spawn/path/filesystem)"
  "provider:25+ LLM provider adapters (OpenAI-compat + Anthropic + Google)"
  "session:Main conversation loop, streaming, cancel, 5 compaction strategies"
  "tool:52 built-in tools (read/edit/bash/agent_spawn/task_*/mcp/skill/rlm_query/...)"
  "command:108 slash commands (/clear, /compact, /model, /agents, ...)"
  "tui:Terminal UI rendering with @opentui/solid"
  "mcp:MCP client + self-server (stdio/SSE/websocket)"
  "skill:Skill loader (4-dir scan + GitHub remote pull + index)"
  "agent:Sub-agent spawn + RLM parallel children"
  "memory:Cross-session memory (10-section template + extractMemories + teamSync)"
  "plugin:Plugin protocol (npm-distributed extensions for tools/commands)"
  "server:HTTP/SSE headless API (Hono + Bun adapter)"
  "lsp:LSP client (rust-analyzer/pyright/tsserver/gopls/clangd)"
  "cli:Main entry — parse argv, load config, launch TUI or server"
)

cd "$(dirname "$0")/.."

for entry in "${PACKAGES[@]}"; do
  name="${entry%%:*}"
  desc="${entry#*:}"
  dir="packages/$name"
  mkdir -p "$dir/src" "$dir/tests"

  if [[ ! -f "$dir/package.json" ]]; then
    cat > "$dir/package.json" <<EOF
{
  "name": "@openseek/$name",
  "version": "0.0.1",
  "private": true,
  "type": "module",
  "main": "./src/index.ts",
  "exports": {
    ".": "./src/index.ts"
  }
}
EOF
  fi

  if [[ ! -f "$dir/src/index.ts" ]]; then
    cat > "$dir/src/index.ts" <<EOF
// @openseek/$name — $desc
// Implementation begins per SPEC.md milestone gates.

export const PACKAGE_NAME = "@openseek/$name";
EOF
  fi

  if [[ ! -f "$dir/tests/smoke.test.ts" ]]; then
    cat > "$dir/tests/smoke.test.ts" <<EOF
import { test, expect } from "bun:test";
import { PACKAGE_NAME } from "../src/index.ts";

test("$name package identifies itself", () => {
  expect(PACKAGE_NAME).toBe("@openseek/$name");
});
EOF
  fi

  if [[ ! -f "$dir/README.md" ]]; then
    cat > "$dir/README.md" <<EOF
# @openseek/$name

$desc

See [SPEC.md](../../SPEC.md) for milestone gates this package contributes to,
and [docs/ARCHITECTURE.md](../../docs/ARCHITECTURE.md) for the full layer map.

## Layer rule

This package may import from:
- packages/core (always allowed)
- (other packages: see ARCHITECTURE.md)

This package may NOT import from:
- packages/cli, packages/tui (they are upstream)

## Tests

\`\`\`bash
bun test packages/$name
\`\`\`
EOF
  fi

done

echo "[scaffold] all 14 packages have package.json + src/index.ts + tests/smoke.test.ts + README.md"
