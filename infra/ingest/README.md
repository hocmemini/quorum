# infra/ingest

WP-7 ingestion path: a CloudWatch alarm entering ALARM is routed by EventBridge to the
`@quorum/ingest` Lambda, which performs an idempotent incident write into Aurora DSQL.

## Apply (after infra/app is up)

1. Build the bundle: `pnpm --filter @quorum/ingest build` (produces `functions/ingest/dist/index.js`).
2. Set `dsql_endpoint` and `cluster_arns` from `terraform -chdir=infra/app output`.
3. `terraform -chdir=infra/ingest init && terraform -chdir=infra/ingest apply`.

For a persistent stack, use the S3 backend from `infra/bootstrap` (see `infra/app`).

## Flow

`CloudWatch alarm -> ALARM` -> EventBridge rule (`detail.state.value = ALARM`) -> Lambda
(`index.handler`) -> `createIncident` (idempotent on a deterministic `incident_id` / `event_id`).
A re-delivered alarm event dedups on the primary key, so duplicate delivery is safe (DEC-005).

The demo alarm that exercises this path is created by the chaos harness (WP-9).
