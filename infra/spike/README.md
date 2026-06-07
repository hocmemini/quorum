# infra/spike

Terraform for the WP-0 failover spike: a multi-Region Aurora DSQL cluster pair
(`us-east-1` + `us-east-2`) sharing a witness (`us-west-2`), plus the IAM policy that lets
the spike runner obtain DSQL admin auth tokens.

**Verified against `hashicorp/aws` v6.49 provider schema (2026-06):** resources are
`aws_dsql_cluster` (with `multi_region_properties { witness_region }`) and
`aws_dsql_cluster_peering` (`identifier`, `clusters`, `witness_region`). The region trio is
the AWS-documented supported US set. State is **local and ephemeral**, no S3 backend.

## Apply (once AWS auth clears)

```sh
export AWS_PROFILE=h0
terraform -chdir=infra/spike init
terraform -chdir=infra/spike apply
# wire the client:
terraform -chdir=infra/spike output -raw spike_env > packages/spike-failover/.env
```

DSQL clusters take a few minutes to reach `ACTIVE`. Then run the spike:

```sh
pnpm --filter @quorum/spike-failover report
```

## Teardown (no idle cost)

```sh
scripts/teardown-spike.sh        # terraform destroy + verification sweep
```

## Notes

- `deletion_protection_enabled = false` so the ephemeral spike destroys cleanly.
- Endpoints: `<identifier>.dsql.<region>.on.aws` (witness has no endpoint).
- DSQL free tier scales to zero when idle; teardown still recommended.
