# infra/app

Production multi-Region Aurora DSQL for Quorum: two peered clusters (`us-east-1` + `us-east-2`)
sharing a witness (`us-west-2`), the WP-0-proven pattern, with **deletion protection ON** so it
stays reachable through judging. Verified against `hashicorp/aws` v6.49.

## ⚠️ Before go-live (persistent, paid infra)

1. Stand up `infra/bootstrap` first (tfstate bucket) and switch this stack to the **S3 backend**
   (`use_lockfile = true`), do not run a persistent cluster on local state.
2. `terraform -chdir=infra/app apply` (creates the clusters; ACTIVE in a few minutes).
3. Wire consumers from outputs:
   - `terraform -chdir=infra/app output -raw app_env > <app>/.env`
   - feed `cluster_arns` into `infra/monitor` (`var.cluster_arns`) so the monitor can connect.
4. Apply migrations: `AWS_PROFILE=h0 MIGRATIONS_DIR=packages/db/migrations pnpm --filter @quorum/db migrate`.

## Teardown (only after judging)

Set `deletion_protection = false`, `terraform apply`, then `terraform destroy`.
