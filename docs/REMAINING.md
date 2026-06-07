# Quorum — Consolidated Remaining Work

Run top-to-bottom in **one pass once AWS auth clears**. Everything here is blocked today
because the `h0` key authenticates intermittently and then fully fails
(`InvalidClientTokenId` / `AuthFailure`) — the account's up-to-24h billing/verification
window. As of **2026-06-07 18:58 UTC even STS fails**, so nothing below could execute.

**Standing ground rules for all AWS work below:** region `us-east-1`; imperative AWS CLI only
(no Terraform, nothing into state); tag every taggable resource `Project=h0-credits,
Ephemeral=true`; **never print/log any password or credential**; destroy everything created
in the credits pass **except the budget**; log each action to `docs/PROVENANCE.md`.

---

## 0. Precondition — auth gate

```sh
export AWS_PROFILE=h0
aws ec2 describe-regions --region us-east-1 >/dev/null 2>&1 \
  && echo "AUTH OK — proceed" \
  || echo "STILL BLOCKED — wait and retry later"
```

If it's still blocked **and** you rotated the key, reconfigure first (never echo the secret):

```sh
aws configure set aws_access_key_id <NEW_ID> --profile h0
aws configure set aws_secret_access_key <NEW_SECRET> --profile h0
```

---

## A. AWS Free Tier activity credits  ($20 × 5 = $100; real-cost target < $0.10)

> **Truth source:** the console **Explore AWS / "Get started"** panel. After running these,
> wait a few hours; any activity still **Not started** must be redone manually in the console.

### A1 — Budgets ($20) — PERMANENT guardrail, do NOT delete

```sh
ACCT=$(aws sts get-caller-identity --query Account --output text)
aws budgets describe-budgets --account-id $ACCT --query 'Budgets[].BudgetName' --output text
# If no ~$20 budget exists, create one (matches infra/bootstrap spec so TF can import/replace):
cat > /tmp/h0-budget.json <<'JSON'
{"BudgetName":"h0-monthly-20","BudgetLimit":{"Amount":"20","Unit":"USD"},"TimeUnit":"MONTHLY","BudgetType":"COST"}
JSON
aws budgets create-budget --account-id $ACCT --budget file:///tmp/h0-budget.json
```
Notifications (50/80/100%) need a subscriber (SNS/email) — add them when `infra/bootstrap`
lands, or with `--notifications-with-subscribers`. **Overlap:** if bootstrap later manages the
budget, `terraform import aws_budgets_budget.this $ACCT:h0-monthly-20` (or delete this CLI
budget first) to avoid a duplicate.

### A2 — Lambda web app ($20) — ephemeral

```sh
ROLE_ARN=$(aws iam create-role --role-name h0-credits-lambda \
  --assume-role-policy-document '{"Version":"2012-10-17","Statement":[{"Effect":"Allow","Principal":{"Service":"lambda.amazonaws.com"},"Action":"sts:AssumeRole"}]}' \
  --tags Key=Project,Value=h0-credits Key=Ephemeral,Value=true \
  --query Role.Arn --output text)
aws iam attach-role-policy --role-name h0-credits-lambda \
  --policy-arn arn:aws:iam::aws:policy/service-role/AWSLambdaBasicExecutionRole

mkdir -p /tmp/h0fn && cat > /tmp/h0fn/index.mjs <<'JS'
export const handler = async () => ({
  statusCode: 200,
  headers: { 'content-type': 'text/html' },
  body: '<!doctype html><title>ok</title><h1>ok</h1>',
});
JS
( cd /tmp/h0fn && zip -q fn.zip index.mjs )

sleep 10   # let the new role propagate before Lambda assumes it
aws lambda create-function --function-name h0-credits-web \
  --runtime nodejs22.x --handler index.handler --role "$ROLE_ARN" \
  --zip-file fileb:///tmp/h0fn/fn.zip --tags Project=h0-credits,Ephemeral=true

URL=$(aws lambda create-function-url-config --function-name h0-credits-web \
  --auth-type NONE --query FunctionUrl --output text)
aws lambda add-permission --function-name h0-credits-web --statement-id public \
  --action lambda:InvokeFunctionUrl --principal '*' --function-url-auth-type NONE
curl -s -o /dev/null -w 'HTTP %{http_code}\n' "$URL"   # expect HTTP 200

# teardown
aws lambda delete-function-url-config --function-name h0-credits-web
aws lambda delete-function --function-name h0-credits-web
aws iam detach-role-policy --role-name h0-credits-lambda \
  --policy-arn arn:aws:iam::aws:policy/service-role/AWSLambdaBasicExecutionRole
aws iam delete-role --role-name h0-credits-lambda
```

### A3 — EC2 t3.micro ($20) — ephemeral

```sh
AMI=$(aws ssm get-parameter \
  --name /aws/service/ami-amazon-linux-latest/al2023-ami-kernel-default-x86_64 \
  --query Parameter.Value --output text)
aws ec2 describe-vpcs --filters Name=isDefault,Values=true --query 'Vpcs[0].VpcId' --output text
# if that prints None:  aws ec2 create-default-vpc

IID=$(aws ec2 run-instances --image-id "$AMI" --instance-type t3.micro --count 1 \
  --tag-specifications \
    'ResourceType=instance,Tags=[{Key=Project,Value=h0-credits},{Key=Ephemeral,Value=true}]' \
    'ResourceType=volume,Tags=[{Key=Project,Value=h0-credits},{Key=Ephemeral,Value=true}]' \
  --query 'Instances[0].InstanceId' --output text)
aws ec2 wait instance-running --instance-ids "$IID"
# verify root volume is delete-on-termination (expect True)
aws ec2 describe-instances --instance-ids "$IID" \
  --query 'Reservations[0].Instances[0].BlockDeviceMappings[*].Ebs.DeleteOnTermination' --output text
sleep 120   # hold ~2 min
aws ec2 terminate-instances --instance-ids "$IID"
aws ec2 wait instance-terminated --instance-ids "$IID"
```

### A4 — RDS PostgreSQL db.t4g.micro ($20) — ephemeral, slow (~15 min)

```sh
# throwaway master password — in memory only, never echoed/stored
PW=$(openssl rand -base64 24 | tr -dc 'A-Za-z0-9' | cut -c1-20)
aws rds create-db-instance --db-instance-identifier h0-credits-pg \
  --engine postgres --db-instance-class db.t4g.micro \
  --allocated-storage 20 --storage-type gp3 \
  --master-username h0admin --master-user-password "$PW" \
  --backup-retention-period 0 --no-multi-az --no-publicly-accessible \
  --no-deletion-protection \
  --tags Key=Project,Value=h0-credits Key=Ephemeral,Value=true
unset PW
aws rds wait db-instance-available --db-instance-identifier h0-credits-pg   # up to ~15 min
aws rds delete-db-instance --db-instance-identifier h0-credits-pg \
  --skip-final-snapshot --delete-automated-backups
aws rds wait db-instance-deleted --db-instance-identifier h0-credits-pg
# verify nothing lingers
aws rds describe-db-snapshots --query 'DBSnapshots[?DBInstanceIdentifier==`h0-credits-pg`].DBSnapshotIdentifier' --output text
```

### A5 — Bedrock ($20) — best-effort CLI, manual fallback

```sh
aws bedrock list-foundation-models --region us-east-1 \
  --query 'modelSummaries[?contains(modelId,`nova-micro`)].modelId' --output text
aws bedrock-runtime converse --region us-east-1 --model-id amazon.nova-micro-v1:0 \
  --messages '[{"role":"user","content":[{"text":"hello"}]}]' \
  --inference-config 'maxTokens=10' --query 'output.message.content[0].text' --output text
# AccessDenied / no model available without an access request -> skip, do the manual step.
```
**Manual fallback (2 min, guarantees the credit):** Console → **Bedrock** → region
**us-east-1** → **Playgrounds → Chat** → select any available model → send one short
message.

### A6 — Verification sweep (zero ephemeral residue)

```sh
aws ec2 describe-instances --filters Name=tag:Project,Values=h0-credits \
  Name=instance-state-name,Values=pending,running,stopping,stopped \
  --query 'Reservations[].Instances[].InstanceId' --output text
aws ec2 describe-volumes --filters Name=tag:Project,Values=h0-credits --query 'Volumes[].VolumeId' --output text
aws rds describe-db-instances --query 'DBInstances[?DBInstanceIdentifier==`h0-credits-pg`].DBInstanceIdentifier' --output text
aws lambda get-function --function-name h0-credits-web 2>&1 | grep -q ResourceNotFound && echo "lambda gone"
aws iam get-role --role-name h0-credits-lambda 2>&1 | grep -q NoSuchEntity && echo "role gone"
# all of the above should be empty / "gone". The $20 budget intentionally remains.
```

---

## B. Previous-run deferred work (pre-spike prep)

### B1 — Phase 1 account audit (read-only) → fill `docs/AUDIT.md`
- §1 spend: the two Cost Explorer calls (commands in AUDIT.md).
- §2 sweep: `AWS_PROFILE=h0 scripts/audit-sweep.sh | tee docs/sweep-2026-06-07-raw.txt`.
- §3 IAM hygiene: `get-account-summary`, credential report, role trust/admin scan,
  `s3control get-public-access-block`, and `aws dsql list-clusters` per region.
- Produce the **KILL LIST / KEEP LIST**, then **STOP for line-item approval**.
- (DSQL multi-region trio `us-east-1`+`us-east-2`+`us-west-2`-witness already confirmed via docs.)

### B2 — Phase 2 cleanup  [gated on B1 approval]
Delete only approved kill-list items, one at a time; snapshot/export stateful resources first;
deactivate IAM users/keys before deleting. Log every command to PROVENANCE.

### B3 — Phase 3 AWS scaffold  [gated on approval + needs your alert email]
- Account-level S3 Block Public Access.
- `infra/bootstrap` Terraform (state local + gitignored): tfstate bucket
  `h0-quorum-tfstate-<accountid>` (versioned, SSE, TLS-only policy); SNS topic + email
  subscription; `$20` monthly budget @ 50/80/100% → SNS; CloudWatch billing alarm **iff**
  "Receive Billing Alerts" is enabled. Reconcile with the A1 budget (import or replace).

---

## C. WP-0 Aurora DSQL failover spike → `packages/spike-failover`

**Built + validated locally (2026-06-07):** `infra/spike` (`terraform validate` ✓),
`packages/spike-failover` (strict `tsc` ✓, **10/10** unit tests ✓), schemas/APIs verified
against current docs. Remaining steps need live auth:

```sh
export AWS_PROFILE=h0
terraform -chdir=infra/spike init
terraform -chdir=infra/spike apply                                   # clusters reach ACTIVE in a few min
terraform -chdir=infra/spike output -raw spike_env > packages/spike-failover/.env
pnpm --filter @quorum/spike-failover report                          # PASS/FAIL gate + writes SPIKE_RESULTS.md
git add packages/spike-failover/SPIKE_RESULTS.md && git commit -m "spike: WP-0 results"
scripts/teardown-spike.sh                                            # no idle cost
```

Go/no-go by the SOW's Jun 9 checkpoint (WP-0 gates the whole project).
