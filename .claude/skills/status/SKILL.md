---
name: status
description: Report the live status of the Quorum backend (clusters, Lambdas, budget, monitor metrics). Use when the operator asks for status, health, spend, or what is running.
---

# Status

Run `scripts/status.sh` (read-only, `AWS_PROFILE=h0`) and summarize:

- DSQL clusters per region (up or none).
- `quorum` Lambdas (monitor, ingest) and last-modified.
- Budget name and current actual spend.
- Monitor metrics (consistency / failover / write latency) over the last hour.
- The chaos partition env state.

Flag anything unexpected (spend climbing, a cluster missing, failover not OK). Read-only; no confirmation needed.
