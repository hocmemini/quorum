# infra/monitor

Automated DSQL monitor (DEC-011): a scheduled Lambda (`functions/dsql-monitor`) that reruns the
WP-0 claims (strong consistency, active-active, failover-survival) + cross-region write latency
against the live cluster and emits CloudWatch metrics (`Quorum/DSQLMonitor`), with alarms on
claim failure or latency regression. Continuous validation, no manual runs.

## Apply (after the app DSQL cluster exists — WP-8)

```sh
export AWS_PROFILE=h0
pnpm --filter @quorum/dsql-monitor build          # -> functions/dsql-monitor/dist/index.js
cp terraform.tfvars.example terraform.tfvars      # fill in endpoints + cluster_arns (gitignored)
terraform -chdir=infra/monitor init
terraform -chdir=infra/monitor apply
```

## Notes
- Writes to an isolated `spike_event` probe table in the target cluster (not the app tables).
- Schedule defaults to `rate(6 hours)`; tune `schedule_expression`.
- Set `alarm_sns_topic_arn` to the Phase-3 SNS topic to route alarms to email.
- Local state for now; moves to the S3 backend with the other stacks.
