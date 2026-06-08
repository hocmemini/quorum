#!/bin/sh
# Vercel deploy preflight (DEC-009): this project deploys to a DEDICATED Vercel account via the
# CLI only. This machine may hold a session for a DIFFERENT, production Vercel account, so every
# state-mutating vercel command (link, deploy, env, rm, promote, alias) must run this first and
# STOP on a nonzero exit. POSIX sh, no dependencies. Never skipped for speed.
#
# Honors:
#   VERCEL                 command to invoke (default: vercel); e.g. "pnpm dlx vercel@latest"
#   VERCEL_TOKEN           if set, auth via --token instead of an interactive session
#   VERCEL_EXPECTED_ACCOUNT  the throwaway account's whoami value; deploy refuses on mismatch
set -u

fail() {
  printf '\n*** VERCEL PREFLIGHT FAILED ***\n  %s\n' "$1" >&2
  printf '  Refusing to run the vercel command (DEC-009: CLI-only, correct account).\n\n' >&2
  exit 1
}

VERCEL="${VERCEL:-vercel}"

# 1) Expected account must be configured (value lives outside the repo, never committed).
if [ -z "${VERCEL_EXPECTED_ACCOUNT:-}" ]; then
  fail "VERCEL_EXPECTED_ACCOUNT is unset. Confirm the account once with: $VERCEL whoami [--token ...], then set it in ~/.config/quorum/vercel.env"
fi

# 2) Resolve the active identity (token-based if a token is present, else interactive session).
if [ -n "${VERCEL_TOKEN:-}" ]; then
  actual=$($VERCEL whoami --token "$VERCEL_TOKEN" 2>/dev/null) || fail "vercel whoami --token failed (bad/expired token?)."
else
  actual=$($VERCEL whoami 2>/dev/null) || fail "No active Vercel session. Run: $VERCEL login (hackathon account)."
fi
actual=$(printf '%s' "$actual" | tr -d '[:space:]')
if [ -z "$actual" ]; then
  fail "vercel whoami returned empty output; cannot confirm the account."
fi

# 3) The identity must be the expected throwaway account, not the production one.
expected=$(printf '%s' "$VERCEL_EXPECTED_ACCOUNT" | tr -d '[:space:]')
if [ "$actual" != "$expected" ]; then
  fail "Wrong Vercel account: '$actual', expected '$expected'. This may be the PRODUCTION account; do NOT proceed."
fi

printf 'vercel preflight OK - account: %s\n' "$actual"
