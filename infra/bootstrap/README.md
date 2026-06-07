# infra/bootstrap

Chicken-and-egg Terraform stack. **Its own state stays local and gitignored** — it creates
the bucket every other stack uses for remote state.

Creates (Phase 3):

- `h0-quorum-tfstate-<accountid>` — versioned, SSE, TLS-only bucket policy. Remote-state
  backend for all other stacks (`backend "s3"` with `use_lockfile = true` — native S3
  locking, **no DynamoDB lock table**).
- SNS alerts topic + email subscription.
- Budget: $20/month, notifications at 50 / 80 / 100% → SNS.
- CloudWatch billing alarm (only if "Receive Billing Alerts" is enabled).

Not yet applied — gated on explicit approval and on billing verification clearing.
