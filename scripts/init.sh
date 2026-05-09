#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "$0")/.."

if ! command -v bun &> /dev/null; then
  echo "[init] bun not found. Install with: brew install oven-sh/bun/bun" >&2
  echo "[init]   or: curl -fsSL https://bun.sh/install | bash" >&2
  exit 1
fi

echo "[init] bun: $(bun --version)"
echo "[init] installing dependencies"
bun install

echo "[init] running verify"
bash scripts/verify.sh
