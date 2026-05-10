#!/usr/bin/env bash
set -euo pipefail

# Repo skeleton lint
required=(
  "README.md"
  "LICENSE"
  "scripts/scaffold-packages.sh"
)

for file in "${required[@]}"; do
  if [[ ! -f "$file" ]]; then
    echo "[lint] missing required file: $file" >&2
    exit 1
  fi
done

# Each package must have package.json + src/index.ts + tests/smoke.test.ts + README.md
declare -a PACKAGES=(core provider session tool command tui mcp skill agent memory plugin server lsp cli)
for pkg in "${PACKAGES[@]}"; do
  for f in package.json src/index.ts tests/smoke.test.ts README.md; do
    if [[ ! -f "packages/$pkg/$f" ]]; then
      echo "[lint] missing: packages/$pkg/$f (run: bash scripts/scaffold-packages.sh)" >&2
      exit 1
    fi
  done
done

echo "[lint] required project skeleton + 14 packages present"

# Source lint (if biome configured)
if [[ -f biome.json ]] && command -v bun &> /dev/null; then
  bun x biome lint packages/
fi
