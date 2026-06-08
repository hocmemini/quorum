#!/usr/bin/env bash
# Cost + promotional-credit snapshot, to budget the PROJECT (not just one run) and keep judging
# headroom. Read-only. Notes: Cost Explorer data lags ~24h and a fresh account may show none yet;
# the exact remaining CREDIT balance is console-only (Billing and Cost Management -> Credits). This
# reports spend and applied credits, and points at the console for the balance.
set -uo pipefail
: "${AWS_PROFILE:=h0}"
export AWS_PROFILE
export AWS_PAGER=""

acct="$(aws sts get-caller-identity --query Account --output text 2>/dev/null || echo UNKNOWN)"
start="${1:-2026-06-01}"
today="$(date -u '+%Y-%m-%d')"
end_excl="$(date -u -d "${today} +1 day" '+%Y-%m-%d' 2>/dev/null || echo "$today")"

echo "== spend ${start} -> ${today} by record type (Credit = credits applied) =="
aws ce get-cost-and-usage \
  --time-period "Start=${start},End=${end_excl}" --granularity MONTHLY --metrics UnblendedCost \
  --group-by Type=DIMENSION,Key=RECORD_TYPE \
  --query 'ResultsByTime[].Groups[].[Keys[0],Metrics.UnblendedCost.Amount,Metrics.UnblendedCost.Unit]' \
  --output text 2>&1 | head -20 \
  || echo "(Cost Explorer returned no data; common on a new account. Check the console.)"

echo
echo "== current-month spend by service (top) =="
aws ce get-cost-and-usage \
  --time-period "Start=${today%-*}-01,End=${end_excl}" --granularity MONTHLY --metrics UnblendedCost \
  --group-by Type=DIMENSION,Key=SERVICE \
  --query 'sort_by(ResultsByTime[0].Groups,&Metrics.UnblendedCost.Amount)[-6:].[Keys[0],Metrics.UnblendedCost.Amount]' \
  --output text 2>&1 | head -10 || true

echo
echo "== budget guardrail (h0-quorum-monthly) actual vs limit =="
aws budgets describe-budget --account-id "$acct" --budget-name h0-quorum-monthly \
  --query 'Budget.[CalculatedSpend.ActualSpend.Amount,BudgetLimit.Amount]' --output text 2>&1 || true

echo
echo "Exact remaining promotional credit: console -> Billing and Cost Management -> Credits."
echo "Claim hackathon AWS + v0 credits via the form linked from the hackathon overview (deadline Jun 26)."
