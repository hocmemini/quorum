#!/usr/bin/env bash
# Quorum go-live orchestrator. Stands up the persistent backend on AWS against the S3 state backend
# from infra/bootstrap. This is PAID (free-tier) infra and is meant to be driven by the operator
# (or by Claude via the `golive` skill) after explicit confirmation. Pairs with teardown.sh.
#
#   scripts/golive.sh up          # app -> data -> functions (bootstrap must already be applied)
#   scripts/golive.sh bootstrap   # the foundation stack (needs TF_VAR_alert_email)
#   scripts/golive.sh app | data | functions | status
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
# shellcheck source=scripts/_tf-backend.sh
. "$ROOT/scripts/_tf-backend.sh"

app_output() { terraform -chdir="$ROOT/infra/app" output "$@"; }

stage_bootstrap() {
  echo "== bootstrap: tfstate bucket, budget, alarms =="
  : "${TF_VAR_alert_email:?set TF_VAR_alert_email or infra/bootstrap/terraform.tfvars}"
  terraform -chdir="$ROOT/infra/bootstrap" init -input=false
  terraform -chdir="$ROOT/infra/bootstrap" apply -input=false -auto-approve
}

stage_app() {
  echo "== app: multi-region DSQL cluster + quorum-vercel IAM =="
  tf_init_remote app app.tfstate
  terraform -chdir="$ROOT/infra/app" apply -input=false -auto-approve
}

stage_data() {
  echo "== data: migrate + seed =="
  local host
  host="$(app_output -raw primary_endpoint)"
  DSQL_ENDPOINT_PRIMARY="$host" DSQL_REGION="$REGION_PRIMARY" pnpm --filter @quorum/db migrate
  DSQL_ENDPOINT_PRIMARY="$host" DSQL_REGION="$REGION_PRIMARY" pnpm --filter @quorum/db seed
}

stage_functions() {
  echo "== functions: build + deploy monitor and ingest =="
  pnpm --filter @quorum/dsql-monitor build
  pnpm --filter @quorum/ingest build
  local host arns
  host="$(app_output -raw primary_endpoint)"
  arns="$(app_output -json cluster_arns)"
  tf_init_remote monitor monitor.tfstate
  terraform -chdir="$ROOT/infra/monitor" apply -input=false -auto-approve -var="cluster_arns=$arns"
  tf_init_remote ingest ingest.tfstate
  terraform -chdir="$ROOT/infra/ingest" apply -input=false -auto-approve \
    -var="dsql_endpoint=$host" -var="cluster_arns=$arns"
}

case "${1:-up}" in
  bootstrap) stage_bootstrap ;;
  app) stage_app ;;
  data) stage_data ;;
  functions) stage_functions ;;
  status) "$ROOT/scripts/status.sh" ;;
  up)
    stage_app
    stage_data
    stage_functions
    "$ROOT/scripts/status.sh"
    ;;
  *)
    echo "usage: golive.sh {up|bootstrap|app|data|functions|status}" >&2
    exit 2
    ;;
esac
