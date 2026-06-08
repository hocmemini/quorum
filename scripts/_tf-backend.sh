#!/usr/bin/env bash
# Shared helpers for golive.sh / teardown.sh. SOURCE this, do not execute it.
# The committed stacks are backend-less (simple `terraform validate`); here we drop a gitignored
# backend_override.tf so app/monitor/ingest use the S3 backend from infra/bootstrap at apply time.
: "${AWS_PROFILE:=h0}"
export AWS_PROFILE
REGION_PRIMARY="${REGION_PRIMARY:-us-east-1}"

acct() { aws sts get-caller-identity --query Account --output text; }
tfstate_bucket() { echo "h0-quorum-tfstate-$(acct)"; }

# tf_init_remote <stack-dir-under-infra> <state-key>; needs $ROOT set by the caller.
tf_init_remote() {
  local dir="$ROOT/infra/$1"
  printf 'terraform {\n  backend "s3" {}\n}\n' >"$dir/backend_override.tf"
  terraform -chdir="$dir" init -input=false -reconfigure \
    -backend-config="bucket=$(tfstate_bucket)" \
    -backend-config="key=$2" \
    -backend-config="region=$REGION_PRIMARY" \
    -backend-config="use_lockfile=true"
}
