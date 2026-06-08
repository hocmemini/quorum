#!/usr/bin/env bash
# Wipe the live DSQL app + probe tables to control storage cost during testing. DESTRUCTIVE.
# Optionally re-seed so a clean demo incident remains for judging.
#
#   scripts/wipe-db.sh           # wipe only
#   scripts/wipe-db.sh --seed    # wipe, then re-seed the catalog + one demo incident
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
: "${AWS_PROFILE:=h0}"
export AWS_PROFILE

host="$(terraform -chdir="$ROOT/infra/app" output -raw primary_endpoint)"
export DSQL_ENDPOINT_PRIMARY="$host"
export DSQL_REGION="${DSQL_REGION:-us-east-1}"

echo "Wiping ${host} (app + probe tables) ..."
QUORUM_WIPE_CONFIRM=yes pnpm --filter @quorum/db wipe --yes

if [ "${1:-}" = "--seed" ]; then
  echo "Re-seeding the catalog + demo incident ..."
  pnpm --filter @quorum/db seed
fi
echo "done."
