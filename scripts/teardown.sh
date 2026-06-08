#!/usr/bin/env bash
# Tear down the Quorum backend: destroy ingest, monitor, then the app cluster (disabling deletion
# protection first). KEEPS infra/bootstrap (the budget guardrail is permanent, CLAUDE.md).
#
#   scripts/teardown.sh           # destroy app stacks, keep bootstrap
#   scripts/teardown.sh all       # also destroy bootstrap (rare; bucket must hold no other state)
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
# shellcheck source=scripts/_tf-backend.sh
. "$ROOT/scripts/_tf-backend.sh"

# Destroy is state-driven; vars only need to be set and well-formed, not real.
DUMMY_ARN='["arn:aws:dsql:us-east-1:000000000000:cluster/placeholder"]'

echo "== destroy ingest =="
tf_init_remote ingest ingest.tfstate
terraform -chdir="$ROOT/infra/ingest" destroy -input=false -auto-approve \
  -var="dsql_endpoint=placeholder.dsql.us-east-1.on.aws" -var="cluster_arns=$DUMMY_ARN"

echo "== destroy monitor =="
tf_init_remote monitor monitor.tfstate
terraform -chdir="$ROOT/infra/monitor" destroy -input=false -auto-approve -var="cluster_arns=$DUMMY_ARN"

echo "== destroy app (disable deletion protection first) =="
tf_init_remote app app.tfstate
terraform -chdir="$ROOT/infra/app" apply -input=false -auto-approve -var="deletion_protection=false"
terraform -chdir="$ROOT/infra/app" destroy -input=false -auto-approve -var="deletion_protection=false"

if [ "${1:-}" = "all" ]; then
  echo "== destroy bootstrap (normally KEPT) =="
  terraform -chdir="$ROOT/infra/bootstrap" destroy -input=false
else
  echo "done. infra/bootstrap (budget guardrail) kept; pass 'all' to remove it too."
fi