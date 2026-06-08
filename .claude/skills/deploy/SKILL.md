---
name: deploy
description: Deploy the Quorum web app to Vercel (DEC-009 CLI-only, dedicated account). Use when the operator asks to deploy the frontend or ship to Vercel.
---

# Deploy to Vercel

CLI-only to the dedicated throwaway account (DEC-009). Credentials live in `~/.config/quorum/vercel.env` (outside the repo); never print, log, or commit them. Full runbook: `docs/DEPLOY.md`.

## Preconditions

- Backend is live (`golive` done); `quorum-vercel` access keys + DSQL endpoints are set in the Vercel project env (docs/DEPLOY.md).
- `VERCEL_EXPECTED_ACCOUNT` is set in the creds file (confirm once with `pnpm dlx vercel@latest whoami --token "$VERCEL_TOKEN"`).

## Run

1. Preview: `scripts/deploy-vercel.sh`. Production: `scripts/deploy-vercel.sh --prod`. The script preflights the account and refuses on a mismatch before any deploy.
2. Report the deployment URL and the Vercel Team ID (for the submission).

## Track

`docs/PROVENANCE.md` entry. The URL is fine to record; Team ID / org id go to `docs/private/` per DEC-008.
