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

echo "== 4/4 front end =="
echo "exercise the deployed war room by hand: open an incident, add a note, resolve, and toggle the"
echo "resilience panel to confirm live failover. Then reset with: scripts/wipe-db.sh --seed"
