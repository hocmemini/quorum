# infra/spike

Terraform for the WP-0 failover spike (Aurora DSQL multi-region: `us-east-1` + `us-east-2`,
witness `us-west-2`). Uses the S3 remote backend created by `infra/bootstrap`
(`use_lockfile = true`). Lands with WP-0.
