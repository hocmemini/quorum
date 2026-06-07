# Project Quorum — Account Audit

**Account `260289091534` (`h0-deploy`) · 2026-06-07 · profile `h0`**

> **Status: PARTIALLY DEFERRED.** STS authenticates, but EC2 / IAM / Cost Explorer / etc.
> still return `AuthFailure` / `InvalidClientTokenId` for the freshly-configured `h0` key on
> this just-reactivated account. A 20-minute background retry did not clear it — consistent
> with the up-to-24h billing/reactivation window. **Live AWS data collection (spend,
> resource sweep, IAM hygiene) is deferred.** This document is scaffolded with the exact
> resume commands; the DSQL region question (no AWS access needed) is answered in §3.
> Re-run everything once `aws ec2 describe-regions` succeeds.

## 1. Spend ground truth (Cost Explorer) — DEFERRED

Two CE calls were attempted and rejected on auth, so **$0 was billed** (Cost Explorer only
charges for processed requests). Resume (≤ 2 calls, ~$0.02 total):

```sh
aws ce get-cost-and-usage --time-period Start=2026-03-09,End=2026-06-07 \
  --granularity MONTHLY --metrics UnblendedCost \
  --group-by Type=DIMENSION,Key=SERVICE --region us-east-1
aws ce get-cost-and-usage --time-period Start=2026-03-09,End=2026-06-07 \
  --granularity MONTHLY --metrics UnblendedCost \
  --group-by Type=DIMENSION,Key=REGION --region us-east-1
```

_Every nonzero service and region line item gets a row here once collected._

## 2. Live resource sweep — DEFERRED (script ready)

`scripts/audit-sweep.sh` (committed) enumerates — strictly read-only — every billable /
silent-biller class across all enabled regions plus global services. Resume:

```sh
AWS_PROFILE=h0 scripts/audit-sweep.sh | tee docs/sweep-2026-06-07-raw.txt   # raw file is gitignored
```

Coverage: EC2 / EBS / snapshots, unattached EIPs, NAT gateways, ELBv2 + classic ELB,
interface/GWLB VPC endpoints, Transit Gateways, Site-to-Site VPNs, RDS/Aurora, Redshift,
OpenSearch, ElastiCache, Neptune, DocumentDB, EKS, ECS services, SageMaker
endpoints/notebooks, Kinesis, MSK, DynamoDB, Lambda, never-expire CloudWatch log groups,
custom dashboards, customer-managed KMS keys, Secrets Manager, ECR, EFS, FSx, Backup vaults,
Elastic Beanstalk, Lightsail, Amplify, App Runner; and globally: S3 (public-access posture
per bucket), CloudFront, Route53 hosted zones + registered domains (auto-renew), Global
Accelerator.

## 3. IAM & security hygiene

### DSQL region availability & multi-region peering — ✅ CONFIRMED (AWS docs)

- **Supported set.** AWS documents multi-Region DSQL linking **within a single continent**:
  US (`us-east-1`, `us-east-2`, `us-west-2`), EU (`eu-west-1/2/3`), AP
  (`ap-northeast-1/2/3`). **No cross-continent linking.** A **witness Region is required** —
  it stores a limited encrypted transaction-log window for quorum and **has no endpoint**;
  the two peered clusters each expose one regional endpoint presenting a single logical DB.
- **Your trio is the canonical documented configuration.** The AWS CLI guide's worked
  example creates clusters in **`us-east-1`** and **`us-east-2`** with
  `--multi-region-properties '{"witnessRegion":"us-west-2"}'` → `us-east-1` + `us-east-2`
  active, **`us-west-2` witness**. ✅ Supported as specified.
- **Deferred (needs auth):** confirm DSQL is enabled for *this account* and list clusters —
  `aws dsql list-clusters --region us-east-1` (then `us-east-2`, `us-west-2`).

### Account hygiene — DEFERRED (needs auth)

Resume commands:

```sh
aws iam get-account-summary --query 'SummaryMap'                 # AccountAccessKeysPresent (root keys), AccountMFAEnabled
aws iam generate-credential-report >/dev/null; sleep 5; \
  aws iam get-credential-report --query Content --output text | base64 -d   # all users: keys, last-used, MFA, root row
aws iam list-roles --query 'Roles[].[RoleName,Arn]'              # then inspect trust docs + AdministratorAccess
aws s3control get-public-access-block --account-id 260289091534  # account-level S3 Block Public Access
```

Will report: root access keys present?, account MFA status, every IAM user + access keys +
last-used dates, any role with `AdministratorAccess` or a wildcard (`"*"`) trust policy, and
the account-level S3 Block Public Access configuration.

## KILL LIST — pending sweep (auth deferred)

| Resource | Region | Est. $/mo | Recommendation (delete / keep / snapshot-then-delete) |
|---|---|---|---|
| _populated after the resource sweep + Cost Explorer run_ | | | |

## KEEP LIST — pending sweep (auth deferred)

| Resource | Region | Why it looks intentional / current |
|---|---|---|
| _populated after the sweep_ | | |

---

**Sources (DSQL multi-Region):**
- [Configuring multi-Region clusters — Amazon Aurora DSQL](https://docs.aws.amazon.com/aurora-dsql/latest/userguide/configuring-multi-region-clusters.html)
- [Using AWS CLI (multi-Region) — Amazon Aurora DSQL](https://docs.aws.amazon.com/aurora-dsql/latest/userguide/multi-region-aws-cli.html)

---

**STOP — Phase 2 gate.** Cleanup awaits your line-item approval of the KILL LIST, which
can't be produced until the sweep runs (auth deferred). Nothing to approve yet.
