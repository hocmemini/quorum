#!/usr/bin/env bash
# WP-9 chaos harness for the live demo. Two independent levers:
#
#   1. Region partition (the thesis): set QUORUM_CHAOS_DOWN_REGIONS=<region> on the app
#      (Vercel env var, or local), so the failover data layer treats that region as down and
#      serves from the survivor. Unset to restore. No database changes; flip and the war room
#      keeps working from the other region.
#
#   2. Real incident: trip a CloudWatch alarm so the ingestion path (EventBridge -> Lambda)
#      opens an incident, demonstrating "auto-creation from a real alarm".
#
# Only puts a metric datapoint and (optionally) creates a demo alarm. Tear it down after recording.
set -euo pipefail
: "${AWS_PROFILE:=h0}"
export AWS_PROFILE
REGION="${REGION:-us-east-1}"
ALARM="${ALARM:-quorum-demo-degradation}"
NS="Quorum/Demo"
METRIC="DemoErrorRate"

case "${1:-help}" in
  arm)
    aws cloudwatch put-metric-alarm --region "$REGION" --alarm-name "$ALARM" \
      --namespace "$NS" --metric-name "$METRIC" --statistic Maximum \
      --period 60 --evaluation-periods 1 --threshold 1 \
      --comparison-operator GreaterThanThreshold --treat-missing-data notBreaching
    echo "armed alarm: $ALARM (EventBridge routes it to the ingestion Lambda)"
    ;;
  trip)
    aws cloudwatch put-metric-data --region "$REGION" --namespace "$NS" \
      --metric-data "MetricName=$METRIC,Value=5,Unit=Count"
    echo "tripped $METRIC; alarm should enter ALARM within ~1 min and open an incident"
    ;;
  disarm)
    aws cloudwatch delete-alarms --region "$REGION" --alarm-names "$ALARM"
    echo "deleted alarm: $ALARM"
    ;;
  *)
    cat <<'USAGE'
usage: scripts/chaos.sh {arm|trip|disarm}
  arm     create the demo CloudWatch alarm (wired to the ingestion Lambda via EventBridge)
  trip    breach it, so ingestion opens an incident (the "real alarm" demo)
  disarm  delete the demo alarm

Region-partition lever (separate): set QUORUM_CHAOS_DOWN_REGIONS=us-east-1 on the app so the
failover layer serves from us-east-2; unset to restore.
USAGE
    ;;
esac
