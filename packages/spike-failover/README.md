# @quorum/spike-failover

WP-0 gate: validate Aurora DSQL multi-region active-active **strong consistency** and
**region-failure survival**. Optimized for a clear pass/fail, not features. Carries into the
real project if it passes (DEC-006).

## Run (after `infra/spike` is applied and AWS auth is live)

```sh
terraform -chdir=../../infra/spike output -raw spike_env > .env   # endpoints
pnpm --filter @quorum/spike-failover report
```

`report` runs the migration, then three claims, prints a PASS/FAIL table, and writes
`SPIKE_RESULTS.md`:

- **C1 — strong consistency:** write via us-east-1, immediately read via us-east-2 (no polling).
- **C2 — active-active:** N concurrent writes from both endpoints; both regions read the
  identical complete set; SQLSTATE 40001 conflicts retried to success.
- **C3 — survival:** mark us-east-1 unreachable; write + read via us-east-2; restore
  us-east-1 and assert it reads every event written during the outage.

Plus median / p99 cross-region write latency. Exit code is non-zero if any claim fails.

## Design (carries forward)

- `failover-client.ts` — ordered multi-region client: IAM token per connect, transparent
  failover on connection error/timeout, OCC retry (40001) on writes, **never on reads**.
- `token.ts` — TTL-cached DSQL IAM auth token (`@aws-sdk/dsql-signer`).
- `pg-connector.ts` — pg pool per endpoint; the `Connector` is an interface so the failover
  logic is unit-tested **without AWS** (`*.test.ts`).
- `migrate.ts` — one DDL per transaction, explicit COMMIT each; `CREATE INDEX ASYNC`.

The "region unreachable" control (`markUnreachable`) is an in-process flag for this spike.
**The final demo upgrades it to a real partition (deny-all NACL or AWS FIS).**

## Unit tests (no AWS needed)

```sh
pnpm --filter @quorum/spike-failover test
```

## Teardown (no idle cost)

```sh
scripts/teardown-spike.sh   # terraform destroy + verification sweep
```
