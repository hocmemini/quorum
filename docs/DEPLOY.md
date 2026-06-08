# Deploy runbook (Vercel + Aurora DSQL)

The web app (`apps/web`, Next.js) deploys to Vercel and talks to the multi-region DSQL clusters
through the region-failover data layer. CLI-only deploys to a dedicated throwaway account
(DEC-009); a preflight refuses any deploy to the wrong account.

## Credentials (never in the repo)

- **Vercel:** `~/.config/quorum/vercel.env` (mode 600, outside the repo). Holds `VERCEL_TOKEN`,
  `VERCEL_ORG_ID`, and (after first confirm) `VERCEL_EXPECTED_ACCOUNT`. `scripts/deploy-vercel.sh`
  sources it; the token is never printed or committed. Rotate after submission.
- **AWS (for the Vercel runtime):** Vercel functions run outside AWS, so they cannot use an IAM
  role. They need an IAM **user's access keys** to mint DSQL IAM tokens (`@aws-sdk/dsql-signer`).
  Keys go into the Vercel project's env, never the repo. Rotate after submission.

## One-time setup

1. **Stand up the data layer** (go-live, gated): `infra/bootstrap` then `infra/app`, then migrate
   and seed. Capture `terraform -chdir=infra/app output` (endpoints + `cluster_arns`).
2. **Create the Vercel runtime IAM user** (gated): an IAM user `quorum-vercel` with a policy
   allowing `dsql:DbConnectAdmin` on the app `cluster_arns`, then `aws iam create-access-key` for
   it. The secret is shown once; put it straight into Vercel (step 4), never a file in the repo.
3. **Confirm the Vercel account** (DEC-009): with `VERCEL_TOKEN` exported from the creds file,
   run `pnpm dlx vercel@latest whoami --token "$VERCEL_TOKEN"`. Append the printed value as
   `VERCEL_EXPECTED_ACCOUNT=<value>` to `~/.config/quorum/vercel.env`.
4. **Link + set project env** (preflight first):
   - `pnpm dlx vercel@latest link --token "$VERCEL_TOKEN"` (Root Directory: `apps/web`; enable
     "Include source files outside of the Root Directory" for the pnpm workspace).
   - Set these in the Vercel project (Production + Preview), via `vercel env add` or the dashboard:

     | Name | Value |
     |------|-------|
     | `DSQL_ENDPOINT_PRIMARY` | us-east-1 cluster endpoint |
     | `DSQL_ENDPOINT_SECONDARY` | us-east-2 cluster endpoint |
     | `DSQL_REGION` | `us-east-1` |
     | `DSQL_REGION_SECONDARY` | `us-east-2` |
     | `AWS_ACCESS_KEY_ID` | `quorum-vercel` access key id |
     | `AWS_SECRET_ACCESS_KEY` | `quorum-vercel` secret |
     | `AWS_REGION` | `us-east-1` |

## Deploy

```sh
scripts/deploy-vercel.sh           # preview
scripts/deploy-vercel.sh --prod    # production
```

The script sources the creds, runs the DEC-009 preflight (account match), then `vercel deploy`.

## For submission

- Published Vercel project link and **Vercel Team ID** (`VERCEL_ORG_ID`, or `vercel teams ls`).
- Storage-configuration screenshots proving Aurora DSQL usage.
- Confirm the app stays reachable and idle through the judging window (2026-07-24).
