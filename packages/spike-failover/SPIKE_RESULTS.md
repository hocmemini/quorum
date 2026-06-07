# Spike Results — WP-0 Aurora DSQL multi-region failover

_Not yet run._ `terraform -chdir=infra/spike apply` and the claims require live AWS auth,
which is currently inside the account's billing/verification window. Running
`pnpm --filter @quorum/spike-failover report` overwrites this file with the PASS/FAIL table
and cross-region latency.
