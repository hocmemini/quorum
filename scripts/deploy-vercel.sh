#!/usr/bin/env bash
# Deploy the Quorum web app to Vercel (DEC-009: CLI-only, dedicated account, preflighted).
# Reads credentials from ~/.config/quorum/vercel.env (OUTSIDE the repo). Never prints secrets.
#
#   scripts/deploy-vercel.sh            # preview deploy
#   scripts/deploy-vercel.sh --prod     # production deploy
#
# Runtime env (DSQL endpoints + AWS keys for DSQL token signing) lives in the Vercel project,
# not here; see docs/DEPLOY.md.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
CREDS="${VERCEL_CREDS_FILE:-$HOME/.config/quorum/vercel.env}"

if [ ! -f "$CREDS" ]; then
  echo "missing $CREDS - store VERCEL_TOKEN / VERCEL_ORG_ID / VERCEL_EXPECTED_ACCOUNT there" >&2
  exit 1
fi
set -a
# shellcheck disable=SC1090
. "$CREDS"
set +a
: "${VERCEL_TOKEN:?VERCEL_TOKEN not set in $CREDS}"

# A pinned-by-the-lockfile CLI is preferred; default to dlx so no global install is required.
VERCEL="${VERCEL:-pnpm dlx vercel@latest}"
export VERCEL VERCEL_TOKEN
[ -n "${VERCEL_ORG_ID:-}" ] && export VERCEL_ORG_ID
[ -n "${VERCEL_PROJECT_ID:-}" ] && export VERCEL_PROJECT_ID

# DEC-009 account check BEFORE any state-mutating command.
"$ROOT/scripts/preflight-vercel.sh"

cd "$ROOT/apps/web"
if [ "${1:-}" = "--prod" ]; then
  echo "Deploying to PRODUCTION..."
  $VERCEL deploy --prod --token "$VERCEL_TOKEN" --yes
else
  echo "Deploying a PREVIEW (pass --prod for production)..."
  $VERCEL deploy --token "$VERCEL_TOKEN" --yes
fi
