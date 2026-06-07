#!/usr/bin/env bash
# Install the gitleaks binary to ~/.local/bin (no sudo). Linux x64.
set -euo pipefail
DEST="${1:-$HOME/.local/bin}"
mkdir -p "$DEST"

if command -v gh >/dev/null 2>&1; then
  TAG="$(gh api repos/gitleaks/gitleaks/releases/latest --jq .tag_name)"
else
  TAG="$(curl -fsSL https://api.github.com/repos/gitleaks/gitleaks/releases/latest \
    | grep -oP '"tag_name":\s*"\K[^"]+')"
fi
VER="${TAG#v}"
URL="https://github.com/gitleaks/gitleaks/releases/download/${TAG}/gitleaks_${VER}_linux_x64.tar.gz"

echo "Installing gitleaks ${TAG} -> ${DEST}/gitleaks"
tmp="$(mktemp -d)"
trap 'rm -rf "$tmp"' EXIT
curl -fsSL "$URL" -o "$tmp/gitleaks.tar.gz"
tar -xzf "$tmp/gitleaks.tar.gz" -C "$tmp" gitleaks
install -m 0755 "$tmp/gitleaks" "$DEST/gitleaks"
"$DEST/gitleaks" version
echo "Ensure ${DEST} is on your PATH."
