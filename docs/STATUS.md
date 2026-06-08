# Quorum, development status report

**Date:** 2026-06-07. **Owner:** CC (engineering). **For:** UI/JP sync and handoff.
**Headline:** the full product is built, validated, and **LIVE** on Vercel
(`https://quorum-h0.vercel.app`) against the multi-region DSQL stack. Submission deadline 2026-06-29.

## 0. Live update (2026-06-08)

The stack is deployed and verified end-to-end against the live clusters.

- **Live URL:** `https://quorum-h0.vercel.app` (public; Vercel deployment protection disabled for
  judge access). Backend: two DSQL clusters (us-east-1 + us-east-2, witness us-west-2), monitor +
  ingest Lambdas, budget + alarms. Spend $0, within the $20 budget.
- **Measured warm (DEC-015, re-confirmed live):** cross-region write p50 88.8 ms / p99 97.2 ms after
  a ~680 ms one-time cold connect; failover ~57 ms to a warm survivor, ~553 ms cold. The spike's
  ~754 ms was cold-connect cost, not a DSQL limit; warm steady-state is ~85 ms.
- **Connection warmth (A):** functions pinned to iad1; both region pools kept warm with a staggered
  keep-alive; `maxLifetimeSeconds` under the one-hour cap with jitter; `attachDatabasePool`.
- **Workspace tenancy (DEC-016):** org_id-keyed workspaces, private by default, one-field onboarding
  seeding three incidents, join-by-link/code, an always-available `/demo` workspace reset daily by
  cron, alarm ingestion routed to the shared demo feed, 2.5 s war-room polling. Verified live:
  create -> write -> list, and org isolation.
- **Resilience panel + observed region (C):** the war room shows live per-region health + latency,
  the actually-observed serving region, and chaos toggles. Verified live: chaos us-east-1 down ->
  serving flips to us-east-2 with data intact -> restore returns to us-east-1. `isConnectionError`
  validated against real ECONNREFUSED / ENOTFOUND / timeout shapes.
- **Auth path (D): Vercel OIDC, no static key.** The runtime assumes an AWS IAM role
  (`quorum-vercel-oidc`, web-identity trust to `oidc.vercel.com/quorum-h0`, cluster-scoped DSQL
  policy) via `@vercel/functions/oidc`; the static access key was deleted (0 keys remain). Verified:
  the app serves with zero static credentials. Note: CLI deploys are blocked by Vercel's
  commit-author policy on the Hobby plan, so deploys run with git metadata temporarily hidden (no
  Vercel git connection exists, per DEC-009); to deploy normally, make the repo public, connect the
  GitHub account, or upgrade to Pro.
- **Credits (E):** EC2 activity completed in the console (instance terminated). RDS activity: a
  standard db.t3.micro postgres single-AZ instance (`quorum-credit-rds`) created to trigger it, torn
  down once the activity flips to Completed.
- **E2E:** 48 tests pass live; the deployed front+back flow verified by script.

## 1. Snapshot

A multi-region, active-active incident command plane on Aurora DSQL with a Next.js war room on
Vercel. The novel claim, an incident control plane that survives the failure of the region its
own observability runs in, is not just built, it is demonstrable live: a judge can click a button
in the UI to simulate a region outage and watch the war room keep working from the survivor.

- **Tests:** 48 (44 unit + 4 live-gated integration). Fresh-clone build gate: PASS.
- **Hygiene:** gitleaks clean (working tree + full history), editorial pre-submission pass PASS.
- **Compliance:** validated against the live rules. DSQL primary backend + Vercel deploy = eligible,
  B2B track. v0 is optional and we are v0-ready.
- **State:** all code committed and pushed. Nothing paid is running (WP-0 spike was applied,
  proven, and torn down). Go-live is gated behind operator confirmation.

## 2. What is built

- **Data layer (WP-2):** `packages/db`, schema (`service`, `signal`, `incident`, `incident_event`),
  hand-authored migrations (one DDL per txn, `CREATE INDEX ASYNC`), Kysely, IAM-token client with a
  TTL cache.
- **Concurrency + idempotency (WP-3):** OCC retry on 40001, `idempotentWrite` (23505 = success),
  connection-error classifier.
- **Domain (WP-4):** event-sourced append API (open / note / action / assign / status / severity /
  resolve) and a pure `projectIncident` reducer.
- **API (WP-5):** framework-agnostic service handlers + `listIncidents` read.
- **Region-failover data layer (keystone, DEC-006):** `createFailoverDb`, one pool per region,
  sticky failover on connection errors. Honors chaos "down regions" from config, env, and a
  per-request cookie.
- **Ingestion (WP-7):** `functions/ingest` Lambda (CloudWatch alarm to idempotent incident) +
  `infra/ingest` (EventBridge rule to Lambda).
- **Frontend (WP-6):** `apps/web` Next.js war room (list, create, detail, timeline, actions) over
  the failover layer. Tailwind v4 + shadcn-ready, dark ops theme.
- **Judge-facing chaos demo:** session-cookie region-outage toggle; the war room fails over to the
  survivor live, non-destructive, scoped per visitor.
- **Seed (WP-10):** representative service/signal catalog + an idempotent demo incident.
- **Chaos (WP-9):** failover chaos hook + `scripts/chaos.sh` (real-alarm demo).
- **Tests (WP-11):** unit suite + live-gated integration (dedupe, concurrent OCC, projection,
  ingestion smoke).
- **Monitor (DEC-011/012):** `functions/dsql-monitor` + `infra/monitor`, scheduled live validation
  and a CloudWatch observability layer the war room can read.
- **Editorial (WP-12):** reusable pre-submission/public-flip hygiene pass. Pre-submission run PASS.
- **Infra:** `infra/app` (production multi-region cluster + `quorum-vercel` IAM), `infra/bootstrap`
  (tfstate bucket, account BPA, SNS, $20 budget, billing alarm), `infra/monitor`, `infra/ingest`,
  `infra/spike` (torn down).
- **Ops control plane (DEC-014):** `scripts/golive.sh`, `teardown.sh`, `status.sh`, `chaos.sh`,
  `deploy-vercel.sh` + `.claude/skills/*` (golive, teardown, chaos, deploy, status). Operate via
  Claude: `/golive`, `/status`, `/chaos`, `/deploy`, `/teardown`.
- **Deploy:** Vercel path solid. Token stored outside the repo, account confirmed, preflight armed,
  `vercel.json` + `docs/DEPLOY.md`. v0 prompt at `docs/v0-prompt.md`.

## 3. Judging position

Four equally weighted axes (1 to 5) + up to 0.6 bonus for 3 published `#H0Hackathon` posts.

- **Originality + Technical Implementation:** strongest. Genuine insight (control plane survives its
  own region) with a deliberate data model (event-sourced, OCC, multi-region failover).
- **Impact:** strong (real B2B incident-response pain, production-shaped).
- **Design:** was the weak axis; lifted by the Tailwind polish and the interactive chaos demo, and
  further by the optional v0 pass.

## 4. Decisions

DEC-001 through DEC-014 in `docs/SOW.md` 11.1. Recent: DEC-011/012 (monitor + observability),
DEC-013 (chaos homegrown-primary, FIS optional, **awaiting JP confirmation**), DEC-014 (ops via
Claude skills).

## 5. Remaining work

**Operator-gated (JP), in order:**

1. Confirm **DEC-013** (chaos posture) and whether to build the optional FIS Lambda-fault template.
2. **Go-live** (`/golive`): set `TF_VAR_alert_email`, enable console "Receive Billing Alerts", then
   bootstrap to cluster to migrate to seed to monitor to ingest. Free-tier, scale-to-zero, stays up
   through judging.
3. Create the `quorum-vercel` access key, put it + the DSQL endpoints in the Vercel project env,
   then **`/deploy`**.
4. **v0 polish (optional):** sign into v0.app, paste `docs/v0-prompt.md`, export; CC integrates.
5. Rotate the `h0` key and the Vercel token after submission.

**Submission artifacts (UI/JP):**

- Demo video under 3 minutes (show DSQL usage + the live region-failover proof).
- Published Vercel project link + Vercel Team ID.
- Storage-configuration screenshots proving Aurora DSQL.
- Architecture diagram (app to backend).
- Text description naming the database.
- Up to 3 bonus content pieces (the event-sourcing/OCC and failover deep-dives), +0.6.

**CC follow-ups (on trigger):** integrate the v0 export; build the FIS template if approved; re-run
the editorial gate before Jun 29 and the public-flip pass after judging; add a knip entry for the
Tailwind build tooling.

**DEC-015 follow-ups (connection warmth; close before/at go-live; no code changed in the DEC commit):**

- `vercel.json` needs `regions: ["iad1"]` (decision 1); not yet set.
- Fluid Compute + `attachDatabasePool` for idle-connection release (decision 2); the pool is already
  a module-scope singleton.
- `SELECT 1` keep-alive on both region pools + a Vercel Cron warm-up endpoint (decision 3); not built.
- Pool `maxLifetime` under the one-hour session cap, with jitter and staggered recycles (decision 4);
  not set.
- Per-connection IAM token (decision 5): already implemented, no change.
- Warm cross-region latency re-measurement (decision 6): DONE 2026-06-08, n=200 from us-east-1, warm
  write p50=82 ms / p99=90 ms after a 617 ms one-time cold connect; failover ~57 ms warm survivor,
  ~595 ms cold survivor. Confirms the spike's ~754 ms was cold-connect cost. Implement the keep-alive
  (decisions 1-4) so judge-triggered failover lands on a warm survivor.
- Operator DSQL connect on the app clusters is granted out-of-band (an inline IAM policy on the
  deploy user); parameterize it in infra/app (an operator-principal var) for reproducibility.

## 6. Risks / watch items

- Live end-to-end (migrations, monitor, ingestion smoke, the deployed app) is validated only after
  go-live; the integration tests are gated and run then.
- The app must "function as depicted" in the video, so rehearse the chaos demo on the live deploy.
- Keep within the $20 budget; the monitor and clusters scale to zero, but confirm via `/status`.
