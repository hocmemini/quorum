---
name: golive
description: Stand up the live Quorum backend on AWS (DSQL cluster, migrations, seed, monitor + ingest Lambdas). Use when the operator asks to go live, bring the stack up, or deploy the backend.
---

# Go live

Bring up the persistent Quorum backend. PAID free-tier infra (scale-to-zero) that stays up through judging.

## Guardrails

- Resource creation: confirm with the operator before applying, and state the cost posture (free-tier, scale-to-zero).
- Always `AWS_PROFILE=h0`. Never print, log, or store credentials.
- `infra/bootstrap` must already be applied (the tfstate bucket exists). If not, run `scripts/golive.sh bootstrap` first (needs `TF_VAR_alert_email`).

## Run

1. `scripts/golive.sh up` (or stage by stage: `app`, then `data`, then `functions`).
2. On completion run `scripts/golive.sh status` and report cluster identifiers per region, Lambda names, and the seeded demo incident.
3. Capture `terraform -chdir=infra/app output` (endpoints + `cluster_arns`) for the Vercel deploy (`deploy` skill).

## Track

Append a dated entry to `docs/PROVENANCE.md` (what was applied, regions, outcome). Redact account id / ARNs / endpoints per DEC-008 (account-specific detail goes to `docs/private/`).

To remove everything except the budget, use the `teardown` skill.
