#!/usr/bin/env bash
set -euo pipefail

bash scripts/lint.sh
bash scripts/typecheck.sh
bash scripts/test.sh

echo "[verify] all checks passed"
