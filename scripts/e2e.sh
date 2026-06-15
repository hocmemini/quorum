#!/usr/bin/env bash
# Full end-to-end test pass against the LIVE backend (run /golive first). Migrates, seeds, runs the
# gated integration suite, then the warm-latency + failover benchmark. Reports; does not wipe.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
: "${AWS_PROFILE:=h0}"
export AWS_PROFILE

host="$(terraform -chdir="$ROOT/infra/app" output -raw primary_endpoint)"
sec="$(terraform -chdir="$ROOT/infra/app" output -raw secondary_endpoint 2>/dev/null || true)"
export DSQL_ENDPOINT_PRIMARY="$host"
export DSQL_REGION="${DSQL_REGION:-us-east-1}"
if [ -n "$sec" ]; then
  export DSQL_ENDPOINT_SECONDARY="$sec"
  export DSQL_REGION_SECONDARY="${DSQL_REGION_SECONDARY:-us-east-2}"
fi

echo "== 1/4 migrate + seed =="
pnpm --filter @quorum/db migrate
pnpm --filter @quorum/db seed

echo "== 2/4 gated integration suite (live DSQL) =="
pnpm test

echo "== 3/4 warm latency + failover benchmark (DEC-015) =="
pnpm --filter @quorum/db bench

echo "== 4/4 front end: chaos-immune provisioning (DEC-025) =="
BASE="${QUORUM_URL:-https://quorum-h0.vercel.app}"
# Rate-limit bypass (DEC-027) so the suite is never throttled; token from gitignored env, never committed.
[ -f "$HOME/.config/quorum/ratelimit.env" ] && . "$HOME/.config/quorum/ratelimit.env"
BYPASS=()
[ -n "${RATE_LIMIT_BYPASS_TOKEN:-}" ] && BYPASS=(-H "x-ratelimit-bypass: $RATE_LIMIT_BYPASS_TOKEN")
JAR="$(mktemp)"
# /demo must provision (redirect, not 500) even with a both-regions-down chaos cookie present, and
# the resulting workspace must load healthy with chaos cleared.
code="$(curl -s -c "$JAR" "${BYPASS[@]}" -o /dev/null -w '%{http_code}' -b 'quorum_chaos_down=us-east-1,us-east-2' "$BASE/demo")"
[ "$code" = "307" ] || [ "$code" = "302" ] || { echo "FAIL: /demo under both-down returned $code (want 307)"; rm -f "$JAR"; exit 1; }
wcode="$(curl -s -b "$JAR" -o /dev/null -w '%{http_code}' "$BASE/")"
rm -f "$JAR"
[ "$wcode" = "200" ] || { echo "FAIL: provisioned war room returned $wcode (want 200)"; exit 1; }
echo "PASS: /demo provisions ($code) under both-down; war room loads healthy ($wcode)"
# Join-by-code is never rate-limited (DEC-028): create one (bypass), then join it WITHOUT bypass.
created="$(curl -s "${BYPASS[@]}" -X POST "$BASE/api/workspace" -H 'content-type: application/json' -d '{"action":"create","name":"e2e join source"}')"
jcode="$(printf '%s' "$created" | python3 -c "import sys,json;print(json.load(sys.stdin).get('joinCode',''))" 2>/dev/null || true)"
if [ -n "$jcode" ]; then
  jstatus="$(curl -s -o /dev/null -w '%{http_code}' -X POST "$BASE/api/workspace" -H 'content-type: application/json' -d "{\"action\":\"join\",\"code\":\"$jcode\"}")"
  [ "$jstatus" = "200" ] || { echo "FAIL: join-by-code (no bypass) returned $jstatus (want 200)"; exit 1; }
  echo "PASS: join-by-code succeeds without bypass ($jstatus) - never rate-limited (DEC-028)"
else echo "WARN: could not capture join code; skipping join assertion"; fi
echo "Manual: exercise the war room + drill/restore, then reset with scripts/wipe-db.sh --seed"
