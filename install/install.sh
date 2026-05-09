#!/usr/bin/env bash
# OpenSeek installer (G7.5)
#
# Usage:  curl -fsSL https://openseek.dev/install.sh | bash
#
# Detects platform, ensures bun is on PATH, downloads the latest release
# tarball into ~/.openseek/, and symlinks the bin into ~/.local/bin/.
# Set OPENSEEK_VERSION=vX.Y.Z to pin a release; default is "latest".
set -euo pipefail

OPENSEEK_HOME="${OPENSEEK_HOME:-$HOME/.openseek}"
LOCAL_BIN="${LOCAL_BIN:-$HOME/.local/bin}"
VERSION="${OPENSEEK_VERSION:-latest}"
REPO="${OPENSEEK_REPO:-openseek/openseek}"

log() { printf "[openseek-install] %s\n" "$*" >&2; }
fail() { log "error: $*"; exit 1; }

# 1. Detect platform.
unameOS="$(uname -s)"
unameArch="$(uname -m)"
case "$unameOS" in
  Darwin) os="darwin" ;;
  Linux)  os="linux" ;;
  *) fail "unsupported OS: $unameOS (only darwin/linux; Windows requires WSL2)" ;;
esac
case "$unameArch" in
  x86_64|amd64) arch="x64" ;;
  arm64|aarch64) arch="arm64" ;;
  *) fail "unsupported arch: $unameArch" ;;
esac
log "platform: ${os}-${arch}"

# 2. Ensure bun is installed.
if ! command -v bun >/dev/null 2>&1; then
  log "bun not found — installing from https://bun.sh"
  curl -fsSL https://bun.sh/install | bash
  # bun installer writes to ~/.bun; make it visible for the rest of this script.
  export PATH="$HOME/.bun/bin:$PATH"
  command -v bun >/dev/null 2>&1 || fail "bun install failed; please install manually"
fi
log "bun: $(bun --version)"

# 3. Download release tarball.
mkdir -p "$OPENSEEK_HOME" "$LOCAL_BIN"
if [[ "$VERSION" == "latest" ]]; then
  url="https://github.com/${REPO}/releases/latest/download/openseek-${os}-${arch}.tar.gz"
else
  url="https://github.com/${REPO}/releases/download/${VERSION}/openseek-${os}-${arch}.tar.gz"
fi
log "downloading $url"
tmp="$(mktemp -d)"
trap 'rm -rf "$tmp"' EXIT
if ! curl -fL -o "$tmp/openseek.tar.gz" "$url"; then
  log "release tarball not yet published — falling back to source build"
  log "  git clone https://github.com/${REPO} ~/.openseek/src"
  log "  cd ~/.openseek/src && bun install && bun run build"
  log "  ln -sf \$PWD/bin/openseek $LOCAL_BIN/openseek"
  exit 0
fi
tar -xzf "$tmp/openseek.tar.gz" -C "$OPENSEEK_HOME"

# 4. Symlink the launcher.
ln -sf "$OPENSEEK_HOME/bin/openseek" "$LOCAL_BIN/openseek"
chmod +x "$OPENSEEK_HOME/bin/openseek" 2>/dev/null || true

# 5. Print next steps.
cat <<MSG

OpenSeek installed to: $OPENSEEK_HOME
Launcher symlinked to: $LOCAL_BIN/openseek

If \`$LOCAL_BIN\` is not on your PATH, add this to your shell rc:
    export PATH="$LOCAL_BIN:\$PATH"

Quick start:
    openseek doctor          # health-check
    openseek                 # start TUI
    openseek serve --http    # headless HTTP/SSE on :7117

MSG
