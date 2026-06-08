#!/usr/bin/env bash
# Read-only status of the live Quorum backend. Safe to run any time.
set -uo pipefail
: "${AWS_PROFILE:=h0}"
export AWS_PROFILE
export AWS_PAGER=""

echo "== DSQL clusters =="
for r in us-east-1 us-east-2 us-west-2; do
  printf '[%s] ' "$r"
  aws dsql list-clusters --region "$r" --query 'clusters[].identifier' --output text 2>&1 || true
done

echo "== Lambdas (us-east-1) =="
aws lambda list-functions --region us-east-1 \
  --query "Functions[?starts_with(FunctionName,'quorum')].[FunctionName,LastModified]" --output text 2>&1 || true

echo "== Budget =="
acct="$(aws sts get-caller-identity --query Account --output text 2>/dev/null || echo UNKNOWN)"
aws budgets describe-budgets --account-id "$acct" \
  --query 'Budgets[].[BudgetName,CalculatedSpend.ActualSpend.Amount]' --output text 2>&1 || true

echo "== Monitor metrics (Quorum/DSQLMonitor, last hour) =="
start="$(date -u -d '1 hour ago' '+%Y-%m-%dT%H:%M:%SZ' 2>/dev/null || date -u '+%Y-%m-%dT%H:%M:%SZ')"
end="$(date -u '+%Y-%m-%dT%H:%M:%SZ')"
for m in StrongConsistencyOk FailoverOk WriteLatencyMs; do
  printf '%-22s ' "$m"
  aws cloudwatch get-metric-statistics --region us-east-1 --namespace Quorum/DSQLMonitor \
    --metric-name "$m" --start-time "$start" --end-time "$end" --period 3600 \
    --statistics Average Maximum --query 'Datapoints[0]' --output text 2>&1 || true
done

echo "== Chaos partition (app env) =="
echo "QUORUM_CHAOS_DOWN_REGIONS=${QUORUM_CHAOS_DOWN_REGIONS:-<unset>} (set on the Vercel project to force failover)"