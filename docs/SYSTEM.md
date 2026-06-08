# Quorum, the system as built (full handoff)

Complete as-built description of the system and every improvement we added beyond the original
plan, written so the UI thread can absorb it and produce the submission (text description, demo
video, architecture diagram, blog posts) and update the SOW. If you maintain the SOW and the
persuasion docs, read this end to end: several headline pieces are new to you.

**New since the original plan (read these first):**

1. A **live, judge-triggerable region-failover showcase** built into the UI (Section 3). This is
   the centerpiece of the demo and the strongest judging asset.
2. A **live DSQL monitor** that doubles as an observability layer (Section 6).
3. A **polished, v0-ready** front end (Section 5) and the finding that **v0 is optional** (Section 9).
4. A **Claude-skill operations control plane** to run everything (Section 8).
5. **LIVE on Vercel** at `https://quorum-h0.vercel.app`, on the real multi-region DSQL stack.
6. A **system-status / resilience panel** on the war room: live per-region health + latency, the
   actually-observed serving region, and the chaos toggles, all on one judge-facing screen.
7. **Workspace tenancy + collaboration (DEC-016):** name-your-workspace onboarding, join-by-link or
   code, an always-available `/demo`, and 2.5 s near-real-time polling so a second screen updates
   itself.
8. **Vercel OIDC auth, no static AWS key:** the runtime assumes an IAM role via web identity, so the
   one long-lived secret is gone. Measured warm: write p50 ~89 ms, failover ~57 ms warm / ~553 ms
   cold.

---

## 1. The thesis

**One line:** an incident command plane whose coordination state survives the failure of any single
region, including the region your observability stack runs in.

**The novel claim (Originality):** every major incident tool runs its control plane in one region
with, at best, asynchronous disaster recovery. That couples the tool you coordinate with to the
outage you are coordinating. Quorum puts the control plane on an active-active, strongly consistent,
multi-region database (Aurora DSQL), so losing a region does not degrade coordination. We do not
just assert this, we let a judge trigger a regional failure and watch the product keep working.

**Track:** Monetizable B2B (incident response for engineering/ops orgs).

## 2. Architecture as built

```text
                       Browser (judge / operator)
                                |
                                v
                  Vercel: Next.js App Router
          server components (reads) + route handlers (writes)
                                |
                                v
            Region-failover data layer (Kysely over pg)
              one connection pool per region, IAM-token auth
                 |                                   |
                 v                                   v
        Aurora DSQL us-east-1   <--- active-active --->   Aurora DSQL us-east-2
                          witness region: us-west-2

   Ingestion:   CloudWatch alarm -> EventBridge rule -> ingest Lambda -> DSQL (idempotent write)
   Observability: dsql-monitor Lambda (scheduled) -> CloudWatch metrics -> war-room health
```

Everything is TypeScript end to end. Auth to DSQL is short-lived IAM tokens (no static passwords);
the Vercel runtime uses a least-privilege `quorum-vercel` IAM user to mint those tokens.

## 3. The headline: a live, judge-triggerable failover showcase

This is the thing the UI has not seen, and it is the demo's centerpiece.

**What the judge sees:** the war room has a "Resilience demo" panel with a button per region,
"Simulate us-east-1 outage". The judge clicks it; the page header flips to `serving region:
us-east-2 (failover active)`; the incident list, creating incidents, adding notes, resolving, all
keep working, served from the surviving region. Click again to restore.

**Why it is credible, not a trick:** the toggle raises a real connection error for the "down"
region, so the **actual failover code path runs** and the request genuinely connects to the other
region's live DSQL endpoint and reads the same data (active-active). The only simulated part is the
trigger; the survival is real.

**Why it is safe (it must "function as depicted"):**

- **Session-scoped:** the down-region set lives in an httpOnly cookie, so one judge's simulated
  outage affects only their own browser, never the global app or other judges.
- **Non-destructive:** active-active means both regions hold the same data; forcing failover changes
  which region serves, with zero data loss.
- **Auto-recovering:** toggle off, or it expires in an hour.

**Why it wins points:** it converts the core claim from something asserted in a video into a fact
the judge verifies themselves, hitting Originality, Technical Implementation, and Impact at once.

Backing this up off the critical path: the WP-0 spike proved the same failover under a real TCP
hang (network blackhole), and the live monitor proves it continuously (Section 6).

## 4. Core technology (for the technical write-up and blog posts)

- **Active-active DSQL:** two peered clusters (us-east-1, us-east-2) sharing a witness (us-west-2),
  strongly consistent. Writes to either region are visible in the other without polling.
- **Region-failover data layer (`createFailoverDb`):** one Kysely/pg pool per region; an operation
  runs against the current region and, on a connection error, fails over to the next and sticks
  there. Retrying a write on failover is safe because writes are idempotent (below). This is the
  WP-0 spike carried into the product.
- **Event-sourced, append-only model:** incidents are a log of events; current state is projected on
  read. Append-only inserts to random UUID keys keep optimistic-concurrency contention near zero,
  which turns DSQL's concurrency model from a fight into a non-event, and the timeline doubles as
  the audit log.
- **Idempotency + OCC:** `event_id` (UUID) is both the primary key and the idempotency key, so a
  duplicate delivery collides on the key and is treated as success; serialization conflicts (40001)
  retry with backoff and jitter. This is what makes failover-retry and at-least-once ingestion safe.
- **IAM-token auth:** every connection uses a short-lived signed token (cached with a TTL), never a
  static credential in the app, repo, or logs.

## 5. The front end

Next.js (App Router) on Vercel. Server components read through the failover layer; route handlers
(`/api/incidents`, `/api/incidents/[id]/events`, `/api/chaos`) are the write/command surface.

Screens: a **war room** (live incident list with status/severity badges, a serving-region indicator,
the resilience panel, and an inline "open incident" form) and an **incident detail** view (projected
state, an append-only timeline, action items, and acknowledge/resolve/note actions).

Styling is Tailwind v4 on a dark ops theme, and the app is **shadcn-ready**: a `v0` export (Vercel's
AI UI builder) drops straight in. The v0 prompt is ready at `docs/v0-prompt.md`; using v0 is optional
polish for the Design score, not a requirement.

## 6. Live monitor and observability

A scheduled Lambda (`dsql-monitor`) re-runs the spike's claims against the live cluster on an
isolated probe table: strong cross-region consistency, active-active, failover survival, and
cross-region write latency. It emits CloudWatch metrics (`Quorum/DSQLMonitor`) with alarms on claim
failure or latency regression. It stays deployed through judging as both a continuous proof of the
thesis and a health panel the war room can surface. Probe writes never touch app tables, and it
stays within the free tier / the $20 budget.

## 7. Data model

Four tables, no foreign keys (integrity is application-layer), random UUID v4 primary keys
(write-distributed):

- `service`: the monitored services (an OSM-informed catalog).
- `signal`: alarms/signals that can open incidents, referencing a service.
- `incident`: the incident stream anchor.
- `incident_event`: the append-only event log (`incident.opened`, `note.added`, `action.created`,
  `action.assigned`, `status.changed`, `severity.changed`, `incident.resolved`). Current state is
  projected from this log.

## 8. Operations: a Claude-driven control plane

Everything is run as Claude Code skills over idempotent scripts, with Claude as the
execution-and-tracking layer (confirm cost/destructive actions, run, report, log):

- `/golive`: stand up the persistent backend (bootstrap to cluster to migrate to seed to monitor to
  ingest), on the S3 state backend.
- `/deploy`: CLI-only Vercel deploy to the dedicated account, behind an account-match preflight.
- `/chaos`: the demo levers (region partition and the real-alarm incident trigger).
- `/status`: read-only health (clusters, Lambdas, budget, monitor metrics).
- `/teardown`: destroy the app stacks, keep the budget guardrail.

Infrastructure stacks: `infra/app` (the production cluster + the `quorum-vercel` IAM user),
`infra/bootstrap` (tfstate bucket, account S3 block-public-access, SNS, $20 budget, billing alarm),
`infra/monitor`, `infra/ingest`, and `infra/spike` (the WP-0 proof, already torn down).

## 9. Decisions and compliance

Decisions DEC-001 through DEC-014 are in `docs/SOW.md` 11.1. The recent and load-bearing ones:

- **DEC-006:** the failover spike carries into the product (realized as the failover data layer).
- **DEC-011 / DEC-012:** the monitor, and the monitor-as-observability layer.
- **DEC-013:** chaos is homegrown-primary; AWS FIS is optional and off the thesis path, because FIS
  has no DSQL fault action and our runtime is serverless + Vercel.
- **DEC-014:** operations run through Claude skills over scripts.

**Compliance (validated against the live rules):** the hard requirement is an AWS database (we use
DSQL) plus a Vercel deployment; **building with v0 is optional**. Judges may test the live app and
there is no restriction on interactive or demo controls, which is exactly why the judge-triggerable
chaos showcase is both allowed and valuable. Submission needs a text description naming the database,
a sub-3-minute video showing DSQL usage and a working project, a published Vercel link plus Team ID,
storage-configuration screenshots, and an architecture diagram.

## 10. Improvements added beyond the original plan

For the UI to update the SOW narrative, here is what is new or materially enhanced versus the
original brief:

- **Judge-triggerable failover showcase in the live UI** (Section 3). New. The single biggest
  judging asset; not in the original plan.
- **Monitor as a live observability layer** (DEC-012). Continuous proof + a health panel.
- **Claude-skill operations control plane** (DEC-014). One-command go-live/teardown/chaos/deploy.
- **v0 finding + v0-ready polish.** v0 is optional (compliance), and the app is Tailwind/shadcn-ready
  with a prepared prompt, plus a polished dark ops UI now.
- **Editorial hygiene gate (WP-12).** A reusable pre-submission and public-flip pass; pre-submission
  run is PASS (ASCII/secret/identifier/spelling/link checks + a fresh-clone build gate).
- **Hardened deploy + security posture.** Secrets live outside the repo, gitleaks pre-commit + full
  history clean, a Vercel account-match preflight, account-specific detail kept in gitignored
  `docs/private/` (DEC-008).

## 11. For the submission (what the UI can now produce)

- **Demo video (under 3 min):** frame the problem (control planes die with their region), show an
  incident auto-created from a real alarm, then the centerpiece, a judge/presenter clicks "Simulate
  us-east-1 outage" and the war room keeps working from us-east-2, end on the monitor health panel.
- **Text description:** name Aurora DSQL; lead with the Originality claim; cite the event-sourced +
  OCC data model and the multi-region failover.
- **Architecture diagram:** Section 2 is diagram-ready (turn it into a clean Mermaid/figure).
- **Bonus content (up to 0.6, three pieces, `#H0Hackathon`):** (1) event-sourcing + OCC on DSQL, (2)
  the multi-region failover data layer and the live chaos proof, (3) building the whole thing as an
  autonomous Claude Code build.
- **Status + remaining operator steps:** see `docs/STATUS.md`.
