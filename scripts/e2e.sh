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
JAR="$(mktemp)"
# /demo must provision (redirect, not 500) even with a both-regions-down chaos cookie present, and
# the resulting workspace must load healthy with chaos cleared.
code="$(curl -s -c "$JAR" -o /dev/null -w '%{http_code}' -b 'quorum_chaos_down=us-east-1,us-east-2' "$BASE/demo")"
[ "$code" = "307" ] || [ "$code" = "302" ] || { echo "FAIL: /demo under both-down returned $code (want 307)"; rm -f "$JAR"; exit 1; }
wcode="$(curl -s -b "$JAR" -o /dev/null -w '%{http_code}' "$BASE/")"
rm -f "$JAR"
[ "$wcode" = "200" ] || { echo "FAIL: provisioned war room returned $wcode (want 200)"; exit 1; }
echo "PASS: /demo provisions ($code) under both-down; war room loads healthy ($wcode)"
echo "Manual: exercise the war room + drill/restore, then reset with scripts/wipe-db.sh --seed"
