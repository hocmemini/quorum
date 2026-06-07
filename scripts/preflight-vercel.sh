#!/bin/sh
# Vercel deploy preflight (DEC-009): this project deploys to a DEDICATED Vercel account via the
# CLI only. This machine may hold a CLI session for a DIFFERENT, production Vercel account, so
# every state-mutating vercel command (link, deploy, env, rm, promote, alias) must run this
# first and STOP on a nonzero exit. POSIX sh, no dependencies. Never skipped for speed.
set -u

fail() {
  printf '\n*** VERCEL PREFLIGHT FAILED ***\n  %s\n' "$1" >&2
  printf '  Refusing to run the vercel command (DEC-009: CLI-only, correct account).\n\n' >&2
  exit 1
}

# 1) Expected account must be configured (value lives in gitignored .env.local).
if [ -z "${VERCEL_EXPECTED_ACCOUNT:-}" ]; then
  fail "VERCEL_EXPECTED_ACCOUNT is unset. Set it in .env.local (see .env.example)."
fi

# 2) Vercel CLI must be installed.
if ! command -v vercel >/dev/null 2>&1; then
  fail "Vercel CLI not found. Install it (e.g. pnpm add -g vercel) and log into the hackathon account."
fi

# 3) There must be an active CLI session.
actual=$(vercel whoami 2>/dev/null) || fail "No active Vercel session (vercel whoami failed). Run: vercel login  (hackathon account)."
actual=$(printf '%s' "$actual" | tr -d '[:space:]')
if [ -z "$actual" ]; then
  fail "vercel whoami returned empty output; cannot confirm the account."
fi

# 4) The session must be the expected account, not the production one.
expected=$(printf '%s' "$VERCEL_EXPECTED_ACCOUNT" | tr -d '[:space:]')
if [ "$actual" != "$expected" ]; then
  fail "Wrong Vercel account: logged in as '$actual', expected '$expected'. This may be the PRODUCTION account - do NOT proceed."
fi

printf 'vercel preflight OK - account: %s\n' "$actual"
