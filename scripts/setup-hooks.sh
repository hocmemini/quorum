#!/usr/bin/env bash
# Point git at the tracked hooks directory (one-time, per clone).
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
git -C "$ROOT" config core.hooksPath .githooks
echo "core.hooksPath = .githooks  (gitleaks pre-commit hook active)"
command -v gitleaks >/dev/null 2>&1 || [ -x "$HOME/.local/bin/gitleaks" ] \
  || echo "WARNING: gitleaks not found — run scripts/install-gitleaks.sh"
