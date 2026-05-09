#!/usr/bin/env bash
set -euo pipefail

if [[ -f tsconfig.json ]] && command -v bun &> /dev/null; then
  bun x tsc --noEmit
else
  echo "[typecheck] tsconfig.json not yet present (pre-v0.1) — skipping tsc"
fi

echo "[typecheck] ok"
