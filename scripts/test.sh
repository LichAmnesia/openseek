#!/usr/bin/env bash
set -euo pipefail

if command -v bun &> /dev/null; then
  bun test
else
  echo "[test] bun not found — install from https://bun.sh" >&2
  exit 1
fi
