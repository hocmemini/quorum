---
name: chaos
description: Operate the chaos controls for the demo, the region-failure partition and the real-alarm incident trigger. Use when the operator asks to run chaos, trigger a failure, or demo region failover.
---

# Chaos controls

Two independent levers (WP-9). Homegrown is the primary mechanism (DEC-013: AWS FIS has no DSQL fault action and our runtime is serverless + Vercel, so it does not fit the core region-failover thesis).

## Region partition (the thesis)

- Force failover: set `QUORUM_CHAOS_DOWN_REGIONS=us-east-1` on the running app (Vercel project env), or locally for a dev run. The failover layer raises a real connection error for that region and serves from us-east-2.
- Restore: unset it.
- Confirm: the war-room header shows the serving region; `scripts/status.sh` echoes the env state.

## Real incident (auto-creation from an alarm)

- `scripts/chaos.sh arm` then `scripts/chaos.sh trip`: a CloudWatch alarm enters ALARM, EventBridge routes it to the ingest Lambda, and an incident opens.
- `scripts/chaos.sh disarm` removes the demo alarm.

## Track

Note demo runs in `docs/PROVENANCE.md`; disarm the demo alarm after recording.
