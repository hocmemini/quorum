#!/usr/bin/env bash
# Destroy the WP-0 spike infrastructure and verify nothing bills afterward.
set -euo pipefail
export AWS_PROFILE="${AWS_PROFILE:-h0}"
ROOT="$(cd "$(dirname "$0")/.." && pwd)"

echo "=== terraform destroy (infra/spike) ==="
terraform -chdir="$ROOT/infra/spike" destroy -auto-approve

echo "=== verification sweep (expect empty) ==="
for r in us-east-1 us-east-2 us-west-2; do
  printf '[%s] dsql clusters: ' "$r"
  aws dsql list-clusters --region "$r" --query 'clusters[].identifier' --output text 2>&1 || true
done
printf '[iam] spike connect policy: '
aws iam list-policies --scope Local \
  --query "Policies[?PolicyName=='quorum-spike-dsql-connect'].Arn" --output text 2>&1 || true

echo "done — anything listed above (besides errors) needs manual cleanup."
