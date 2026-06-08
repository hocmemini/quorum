# infra/bootstrap

Account-foundation stack (Phase 3). Creates the durable tfstate bucket, account-level S3 Block
Public Access, the SNS alert topic + email subscription, the permanent $20 monthly budget
(50/80/100% notifications), and the billing alarm. **Local, gitignored state** (it creates the
bucket the other stacks use), and it is **kept**, not torn down: it owns the budget guardrail.

## Apply

1. Set the alert email out of band: `infra/bootstrap/terraform.tfvars` (gitignored) with
   `alert_email = "..."`, or `export TF_VAR_alert_email=...`.
2. Enable **Receive Billing Alerts** once in the console (Billing -> Billing preferences) so the
   billing alarm has data.
3. `terraform -chdir=infra/bootstrap init && terraform -chdir=infra/bootstrap apply`.
4. Confirm the SNS subscription from the email AWS sends.

The `tfstate_bucket` output is what the app/monitor/ingest stacks init against (see
`scripts/golive.sh`). Native S3 locking (`use_lockfile = true`), no DynamoDB lock table.

## Teardown

Normally left in place (the budget is permanent). To remove everything else first, then:
`terraform -chdir=infra/bootstrap destroy` (works only once the bucket holds no other stacks' state).
