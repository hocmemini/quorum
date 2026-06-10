# Statement of Work: Project Quorum

**Hackathon:** H0, Hack the Zero Stack (AWS Databases + Vercel v0)
**Track:** Monetizable B2B App
**Owner:** Jonathan Piccirilli
**Document status:** Living. Update the Decision Log and Change Log on every material change.
**Created:** 2026-06-06
**Submission deadline:** 2026-06-29, 5:00pm PDT

---

## 0. How to use this document

This is the single source of truth for the project. It exists to do three jobs: let you speak to any point of the plan when it changes, track the provenance of every decision, and seed the final handoff documentation.

Conventions:

- Every section and work item is numbered so it can be referenced directly (for example, "WP-3" or "DEC-004").
- When the plan changes, do two things: edit the affected section, and append a one-line entry to the Change Log (Section 11.2) with the date and the reason. Do not silently overwrite. The diff history in git is the provenance record.
- Keep this file in the monorepo at `/docs/SOW.md` and commit it alongside code changes so decisions and the work that implemented them share a timeline.

---

## 1. Project overview

**Working name:** Quorum.

**One line:** An incident command plane whose coordination state survives the failure of any single region, including the region your observability stack runs in.

**The novel claim (the thing being judged on Originality):** Every major incident platform runs its control plane in a single region with at best asynchronous disaster recovery. That couples the tool you coordinate with to the outage you are coordinating. Quorum puts the control plane on an active-active, strongly consistent, multi-region database, so losing any one region does not degrade coordination. The product demonstrates this live by triggering a real regional failure and continuing to operate.

**Why this track:** It is a B2B SaaS product sold to companies, and a B2B multi-tenant workload is naturally key-distributed, which avoids the optimistic-concurrency hot-key throughput ceiling that would draw scrutiny in the Million-scale track. See DEC-001.

---

## 2. Objectives and success criteria

**2.1 Primary objective:** Submit a complete, scoring entry before the deadline that wins or places in the B2B track, or wins a Best-of award.

**2.2 Secondary objective:** Produce work that stands on its technical merit. This shapes priorities: optimize the demo and the write-ups for rigor and credible data-layer reasoning rather than raw scale numbers.

**2.3 Definition of done:**

- A working, reachable full-stack app on Aurora DSQL multi-region plus Vercel.
- A demo video under three minutes that frames the problem and shows the region-failure proof.
- All required submission artifacts complete (Section 6.1).
- Three published bonus content pieces (Section 6.2).
- The app remains reachable and idle through the judging window (2026-06-30 to 2026-07-24).

---

## 3. Scope

**3.1 In scope:**

- Incident auto-creation from a real CloudWatch alarm.
- Append-only incident timeline.
- Action items, created and assigned as events.
- Two-region active-active operation with a demonstrable region-failure survival.
- A minimal, clean war-room UI scaffolded with v0.
- An OSM-informed service and signal catalog as the data substrate.
- An optimistic-concurrency retry and idempotency layer.
- Seed data so a judge clicking the live link sees a real incident.

**3.2 Explicitly out of scope (cut to fit the window, stated so a judge knows it was deliberate):**

- Role-based access control and SSO.
- Escalation and paging policies.
- Slack, PagerDuty, or other third-party integrations.
- Mobile clients.
- Historical analytics and automated postmortem generation.
- A materialized read-model projection (project on read instead unless time allows).

---

## 4. Technical architecture summary

This section records the locked technical decisions. Rationale lives in the Decision Log (Section 11).

- **Language:** TypeScript, end to end (frontend, server-side data layer, ingestion Lambda). See DEC-002.
- **Frontend:** Next.js, scaffolded with v0, deployed on Vercel.
- **Data access:** Kysely (SQL-first, type-safe query builder) over node-postgres. Hand-authored raw SQL migrations. No ORM. See DEC-003.
- **Database:** Aurora DSQL, multi-region active-active. Region pair us-east-1 and us-east-2 with us-west-2 as witness, to be reconfirmed against the current supported region list at build time. IAM-token authentication, no static credentials.
- **Data model:** Event-sourced and append-only. Tables: `incident`, `incident_event`, `service`, `signal`, optional `incident_projection`. Current state is projected from the event log. See DEC-004.
- **Idempotency:** `event_id` UUID is both the primary key and the idempotency key. Duplicate delivery collides on the primary key and is treated as success. Optimistic-concurrency serialization errors are retried with exponential backoff and jitter. See DEC-005.
- **Ingestion:** Chaos triggers a real failure, a CloudWatch alarm fires, EventBridge routes to a Node Lambda, the Lambda performs an idempotent write into DSQL.
- **Chaos:** Ephemeral harness using homegrown fault injection plus optionally AWS Fault Injection Service. Torn down after recording.
- **Infrastructure as code:** Terraform for the DSQL cluster and witness, IAM, the ingestion path, the chaos harness, and the budget alarm.

**DSQL constraints that shape the build (verified against AWS docs 2026-06-06):**

- Isolation is fixed at Repeatable Read (snapshot). It cannot be changed.
- No foreign keys. Referential integrity is application-layer. JOINs and relationships work.
- No PL/pgSQL, no triggers, no temporary tables, no TRUNCATE.
- One DDL statement per transaction. DDL and DML in separate transactions. The migration runner must commit each `CREATE TABLE` and each `CREATE INDEX ASYNC` on its own.
- A transaction modifies at most 3,000 rows. Seed batches must respect this.
- Use `CREATE INDEX ASYNC` for non-blocking index creation.
- One database (`postgres`) per cluster. Use schemas for separation.
- `SELECT FOR UPDATE` is accepted but does not block; it only participates in commit-time conflict detection.
- Sequences exist now but are not used; random UUID keys are preferred for write distribution.
- Connections time out after one hour.
- Free tier: 100,000 DPUs and 1 GB storage per month, scales to zero when idle.

---

## 5. Work breakdown structure

Owner key: CC = Claude Code (engineering), JP = Jonathan (operator), UI = produced in the Claude chat (documentation and persuasion).

**WP-0. Failover spike (gate).** Owner CC, applied by JP.
Prove DSQL multi-region active-active and region-failure survival in isolation, as a package inside the monorepo. Go/no-go gate. If it works, the code carries forward. If it does not, fall back to a single-region build and reframe (see RISK-1).

**WP-1. Repo scaffolding.** Owner CC.
Monorepo layout (app, infra, functions), tooling, env config, and a terse operational README (provision, run, deploy, env vars only).

**WP-2. Data layer.** Owner CC.
Schema DDL for the five tables, idempotency constraints, migration scripts honoring the one-DDL-per-transaction rule, Kysely setup over node-postgres.

**WP-3. Optimistic-concurrency and idempotency layer.** Owner CC.
Retry wrapper for serialization errors with backoff and jitter, separate read and write paths, idempotent write helpers keyed on the UUID primary key.

**WP-4. Event-sourcing domain logic.** Owner CC.
Append-event API, incident state projected from the log, the derived state machine.

**WP-5. API layer.** Owner CC.
Route handlers for create-incident, append-event, assign-action, read-incident, plus region-aware endpoint selection.

**WP-6. Frontend.** Owner CC, with a v0 export step by JP.
The war-room UI: timeline, action items, and the dual-region consistency affordance the demo needs.

**WP-7. Ingestion path.** Owner CC.
The Lambda ingestor wired from CloudWatch alarm through EventBridge to an idempotent DSQL write, with alarm dedup.

**WP-8. Multi-region infrastructure as code.** Owner CC, applied by JP.
Terraform for the two-region cluster and witness, IAM auth, Vercel env wiring, and the budget alarm.

**WP-9. Chaos harness.** Owner CC, applied by JP.
Ephemeral fleet plus injection scripts, wired to the ingestion alarms.

**WP-10. Seed data.** Owner CC.
Scripts to seed one realistic incident for idle judging, batched under the 3,000-row limit.

**WP-11. Tests.** Owner CC.
Unit tests for retry and idempotency, an integration test proving a conflict retries and a duplicate dedupes, an ingestion smoke test.

**WP-12. Editorial and hygiene pass (gate, runs twice).** Owner CC, approvals by JP.
Reusable repo-wide pass per the editorial prompt: unicode and homoglyph sweep, DEC-008 identifier and secret compliance, code and prose editorial with voice pass, link and Mermaid checks, fresh-clone build gate. Runs in MODE=pre-submission as a Phase 5 gate before the Jun 29 deadline, and again in MODE=public-flip after judging closes, where it additionally produces the full-history redaction-review report, the LICENSE, and the public README draft. Mechanical fixes auto-apply; deletions, rewrites, the license name string, and the redaction decision are JP approvals. Output: docs/EDITORIAL-<date>-<mode>.md.

---

## 6. Deliverables

**6.1 Required by the rules (gates the submission):**

| ID | Deliverable | Owner | Notes |
|----|-------------|-------|-------|
| D-1 | Working project on DSQL plus Vercel | CC build, JP deploy | Must stay reachable through 2026-07-24 |
| D-2 | Text description (which DB, features) | UI | Drafted in chat, pasted by JP |
| D-3 | Demo video, under 3 minutes, public on YouTube | UI plan, JP record | Judges may stop at 3 minutes |
| D-4 | Published Vercel project link plus Team ID | JP | Grab Team ID at deploy |
| D-5 | Architecture diagram | CC source, UI annotated | Mermaid in repo, explained version for submission |
| D-6 | Storage-config screenshots proving DSQL usage | JP | Per the screenshot guide |

**6.2 Bonus content (up to 0.6 points, 0.2 each, on a base of 5.0):**

| ID | Deliverable | Venue | Owner |
|----|-------------|-------|-------|
| D-7 | Blog post 1: event-sourcing and OCC architecture deep-dive | builder.aws.com | UI draft, JP publish |
| D-8 | Blog post 2: narrow technical (snapshot isolation, idempotent retries) | dev.to | UI draft, JP publish |
| D-9 | Blog post 3: build narrative with diagram | LinkedIn | UI draft, JP publish |

Each content piece must be public, not unlisted, include language stating it was created for the H0 hackathon, and use the hashtag #H0Hackathon on social.

**6.3 Project documentation:**

| ID | Deliverable | Owner |
|----|-------------|-------|
| D-10 | This SOW | UI, maintained by JP |
| D-11 | Screenshot guide | UI |

---

## 7. Schedule and milestones

Anchored to 2026-06-06 (Saturday). Submission deadline 2026-06-29, 5:00pm PDT. Approximately 23 days.

**Phase 0, Setup and de-risk. Jun 6 to Jun 9.**
Register, set up the AWS account, request credits, scaffold the repo, make the first safe commit, then build WP-0. Go/no-go gate by end of Jun 9.

**Phase 1, Core data plane. Jun 10 to Jun 14.**
WP-2, WP-3, WP-4, WP-5, and WP-8. The plane works for a single workflow across two regions.

**Phase 2, Frontend, ingestion, chaos. Jun 15 to Jun 20.**
WP-6, WP-7, WP-9. The UI is usable and chaos generates real incidents.

**Phase 3, Integration and resilience demo. Jun 21 to Jun 23.**
End-to-end flow, WP-10 seed data, WP-11 tests, and the region-failure proof dialed in and repeatable.

**Phase 4, Documentation, video, content. Jun 24 to Jun 27.**
Record the demo, finalize and publish D-7 through D-9, complete D-2 and D-5.

**Phase 5, Final and submit. Jun 28 to Jun 29.**
Final deploy, capture D-6 screenshots, grab the Vercel Team ID, submit before 5:00pm PDT on Jun 29.

**Post-submission. Jun 30 to Jul 24.**
Keep the plane reachable and idle for judging. Winners announced on or around Jul 31.

**7.1 Hard deadlines and checkpoints:**

- **Jun 9:** WP-0 failover spike go/no-go. The single most important gate.
- **Jun 26, 12:00pm PT:** AWS and v0 credit request form deadline. Do this in Phase 0; this date is only the backstop.
- **Jun 29, 5:00pm PDT:** Submission deadline. No changes accepted after.
- **Jun 30 to Jul 24:** App must remain reachable.

**7.2 Critical path:** Multi-region active-active failover is the long pole. The demo recording in Phase 4 depends on it working in Phase 3, which depends on the multi-region IaC in Phase 1 and the chaos harness in Phase 2. This is why WP-0 runs first and gates everything.

---

## 8. Operator runbook: your step-by-step

These are the actions only you can take, in order. Engineering and IaC are produced by Claude Code; this list is your part plus the orchestration points.

**Day 1 (Jun 6), in this order:**

1. **Register for the hackathon.** Go to h01.devpost.com, click Join hackathon, sign in or create a free Devpost account. This timestamps your entry. (Do this before your first commit.)
2. **Set up the AWS account.** If you are new to AWS, create an account and select the Paid Plan, not the Free Plan, to avoid service restrictions and the six-month cliff. You still receive the sign-up credits. If you already have a personal account, use it.
3. **Enable billing alerts.** In the Billing console (us-east-1), turn on "Receive Billing Alerts." This is the one Console-only toggle. After this, the budget and alarm are handled by Terraform in WP-8.
4. **Request the hackathon credits.** Complete the AWS and v0 credit request form linked from the hackathon overview page. Deadline is Jun 26 at 12pm PT, but do it now. You get $100 in AWS credits and $30 in v0 credits.
5. **Confirm the v0 and Vercel account.** Sign up at vercel.com if needed.
6. **Initialize the repo.** Create the monorepo and make the initial commit. **This is now safe** (see Section 8.1).
7. **Kick off WP-0.** Hand Claude Code the failover-spike prompt (produced next pass).

**Days 2 to 4 (Jun 7 to Jun 9):**
8. Run the Terraform that Claude Code produces for the spike (`terraform apply`), paste credentials as prompted, and validate the failover demo manually.
9. **Make the go/no-go call by Jun 9.** If the failover is convincing, proceed to Phase 1. If not, invoke RISK-1 fallback.

**Throughout Phases 1 to 3:**
10. For each work package, run the IaC and deploy steps Claude Code hands you, paste any keys, and report failures back into the build loop.
11. Keep commit history intact. Do not squash away the timeline; it is your evidence the work happened in the window.

**Phase 4 (Jun 24 to Jun 27):**
12. Record the demo video from the script produced in chat.
13. Publish blog posts D-7, D-8, D-9 under your name, each with the hackathon language and #H0Hackathon.

**Phase 5 (Jun 28 to Jun 29):**
14. Final deploy to Vercel, run `vercel login` and link, grab the Team ID.
15. Capture the D-6 storage-configuration screenshots.
16. Submit on Devpost before Jun 29, 5:00pm PDT.

**Post:**
17. Leave the plane running and idle. Do not tear down the DSQL cluster or the Vercel deployment until after Jul 24.

**8.1 When is the first commit safe (provenance gate):**
The submission window is May 27 to Jun 29, 2026. This project is greenfield as of Jun 6, so all work falls inside the window and the new-project path applies cleanly. The safe sequence is: register on Devpost (step 1), then initialize the repo and commit (step 6). No substantive project code may predate May 27; for a greenfield build this is automatically satisfied. The DSQL provisioning and Vercel deploy happen in June, satisfying the rule that the integration be used after the window opened. Keep the full commit history as evidence.

---

## 9. Responsibility matrix

| Area | Claude Code | Claude chat (UI) | Jonathan |
|------|-------------|------------------|----------|
| App, data layer, Lambda | Build | | Review |
| Terraform and IaC | Write | | Apply |
| Budget alarm | Write (IaC) | | Enable billing toggle once |
| Operational README | Write | | |
| Architecture diagram | Mermaid source | Annotated version | |
| Submission text | | Draft | Paste |
| Demo video | Chaos runbook | Script and storyboard | Record |
| Blog posts | | Draft | Publish under name |
| Deployment to Vercel | Scaffold and CLI | | Auth, link, Team ID |
| Screenshots | | Guide | Capture |
| Hackathon signup, credentials, verification | | | Own |

---

## 10. Risk register

| ID | Risk | Likelihood | Impact | Mitigation |
|----|------|-----------|--------|------------|
| RISK-1 | Multi-region failover demo is unconvincing or flaky | Medium | High | WP-0 spike first, gate by Jun 9. Fallback: single-region build carried by the event-sourcing and OCC story, reframed pitch |
| RISK-2 | DSQL feature gaps surprise the build (JSON, ON CONFLICT) | Low | Medium | Idempotency designed around the unknown (UUID PK). JSON confirmed likely; TEXT fallback is one line. Reconfirm at build time |
| RISK-3 | Serverless connection exhaustion or expired IAM token | Medium | Medium | Module-scoped connection reuse, no unbounded pools, regenerate the short-lived token per cold start with a TTL cache |
| RISK-4 | Credit burn or surprise AWS charges | Low | Medium | DSQL free tier plus scale-to-zero, tear down the chaos harness, no NAT gateway, $20 budget alarm |
| RISK-5 | Scope creep eats the window | Medium | High | Section 3.2 cut list is firm. Vertical slice only |
| RISK-6 | Region pair no longer supports multi-region peering | Low | High | Reconfirm the supported region list before WP-8 Terraform |
| RISK-7 | Missed the Jun 26 credit deadline | Low | Medium | Request credits Day 1 in Phase 0 |

---

## 11. Decision log and change log

**11.1 Decision log (provenance).** Append, do not edit existing entries. New decisions get the next ID.

- **DEC-001 (2026-06-06): Track is Monetizable B2B App.** Rationale: the product is B2B SaaS, and a B2B multi-tenant workload is key-distributed, avoiding the OCC hot-key throughput ceiling that the Million-scale track would expose. Open Innovation rejected as the most crowded track.
- **DEC-002 (2026-06-06): Language is TypeScript end to end.** Rationale: the frontend is TypeScript regardless via v0 and Next.js. A single typed language minimizes integration surface for an autonomous build, and the compiler acts as a constant reviewer. Both languages are equally within Claude Code's ability, so stack coherence decided it. Python rejected because it forces two runtimes and two auth-glue paths.
- **DEC-003 (2026-06-06): Data access is Kysely over node-postgres, no ORM.** Rationale: SQL-first control over DSQL's DDL quirks, plus types, plus a raw escape hatch. ORMs now work on DSQL but their migration generators risk emitting DSQL-incompatible DDL; Prisma migrate specifically is the friction point.
- **DEC-004 (2026-06-06): Event-sourced, append-only data model.** Rationale: append-only inserts to random UUID keys make OCC contention near zero, which turns DSQL's concurrency model from a fight into a non-event, and the timeline is the audit log. Project on read; skip the materialized projection unless time allows.
- **DEC-005 (2026-06-06): Idempotency via UUID primary key as the idempotency key.** Rationale: removes the dependency on unconfirmed ON CONFLICT behavior. Duplicate delivery collides on the PK and is treated as success; OCC errors are retried.
- **DEC-006 (2026-06-06): Failover spike goes into the monorepo as WP-0, not a throwaway repo.** Rationale: if the spike proves the thesis, the proven code carries forward into the final project.
- **DEC-007 (2026-06-07): WP-0 spike uses raw node-postgres; DEC-003 (Kysely) applies to the production data layer only.** Rationale: the spike validates infrastructure with minimum variables, and Kysely wraps the same pg driver, so the connection, token, and OCC retry code carry forward unchanged. Sequencing, not drift.
- **DEC-008 (2026-06-07): `docs/` is public-safe by default; `docs/private/` (gitignored) holds operational detail**, AUDIT.md, account identifiers, IAM names, spend figures. PROVENANCE.md records actions but redacts account-specific identifiers. The public flip requires a redaction review, or ships as a clean mirror with the private original retained as verification canon (history already contains earlier identifiers; we do not rewrite it).
- **DEC-009 (2026-06-07): The hackathon Vercel account is CLI-deploy only, no Git provider connection.** Rationale: the owner's GitHub identity is login-bound to a separate production Vercel account, and login connections are one-to-one, so connecting it would risk lockout or auto-deploy breakage on the production property. Deploys via `vercel link` and `vercel deploy`; a `vercel whoami` scope check precedes every deploy.
- **DEC-010 (2026-06-07): WP-2 concrete schema.** Tables `service`, `signal`, `incident`, `incident_event` (`incident_projection` deferred, project-on-read per DEC-004). UUID v4 PKs are **app-supplied** (random, write-distributed); `event_id` is PK + idempotency key (DEC-005). **No foreign keys** (app-layer integrity); `incident_event.type` is free text with a documented vocabulary, not a CHECK constraint. Event order = `(created_at, event_id)`. Indexes via `CREATE INDEX ASYNC`: `signal(service_id)`, `incident(created_at)`, `incident_event(incident_id, created_at)`. `gen_random_uuid()` defaults deliberately avoided until confirmed on DSQL.
- **DEC-011 (2026-06-07): Automated DSQL monitor.** A scheduled Lambda (`functions/dsql-monitor`, EventBridge cron) reuses the WP-0 spike claims to validate strong consistency, active-active, and failover-survival, plus cross-region write latency, against the live cluster on a small probe table (`spike_event`). It emits CloudWatch metrics (`Quorum/DSQLMonitor`: `ClaimPass` per claim, `WriteLatencyP50/P99`) with alarms on claim failure or latency regression (→ the Phase-3 SNS topic). Continuous, no manual runs; also keeps the UI's latency concern under live watch. Real network-partition tests stay manual (NACL / AWS FIS) for the demo.
- **DEC-012 (2026-06-07): The DSQL monitor doubles as a live observability layer.** Beyond CI-style validation, it stays deployed through the demo and the judging window (2026-06-30 → 2026-07-24) as an added observability/depth element, it continuously *proves the core claim* (strong cross-region consistency + region-failure survival) and surfaces live write latency. The war-room UI reads the `Quorum/DSQLMonitor` CloudWatch metrics (server-side `GetMetricData`) to render a live multi-region health panel. Constraints: probe writes go only to the isolated `spike_event` table (never app tables); cost stays within free tier / the $20 budget (≤5 custom metrics, scale-to-zero DSQL, Lambda free tier, RISK-4); tighten `schedule_expression` (e.g. `rate(15 minutes)`) during demo/judging for fresh data, relax otherwise. Live end-to-end validation lands with the app cluster (WP-8); the bundle is confirmed loadable today.
- **DEC-013 (2026-06-07): Chaos is homegrown-primary; AWS FIS is optional and secondary.** Rationale: the region-failover thesis runs over managed DSQL (FIS has no DSQL fault action) on serverless + Vercel compute (outside any VPC we control), so FIS cannot inject the Vercel-to-DSQL partition the demo needs. Primary chaos: the WP-9 region-down hook (`QUORUM_CHAOS_DOWN_REGIONS` raises a real connection error so the failover code path runs unchanged), the WP-0 blackhole (real TCP hang via `/etc/hosts`), and the live monitor (DEC-011/012) proving failover continuously under genuine conditions. AWS-native chaos is an optional secondary only: an FIS experiment that faults the ingest Lambda (added latency/error), provided as a template if we want the AWS-native checkbox; it is off the thesis path and built only on request.
- **DEC-014 (2026-06-07): Operations run through Claude Code skills over scripts.** Rationale: the operator drives go-live, teardown, chaos, deploy, and status as `.claude/skills/*` wrapping idempotent scripts (`golive.sh`, `teardown.sh`, `status.sh`, `chaos.sh`, `deploy-vercel.sh`), with Claude as the execution-and-tracking layer (confirm destructive/cost actions, run, report, log to PROVENANCE, redact per DEC-008). App/monitor/ingest use the S3 backend at apply time via a gitignored `backend_override.tf`, so the committed stacks stay backend-less and `terraform validate` is simple; the bootstrap budget is never torn down.
- **DEC-015 (2026-06-07): DSQL connection lifecycle and demo-path warmth.** Context: the WP-0 spike's cross-region write timings (median ~754 ms, p99 ~994 ms, n=50) were deterministic cold-connection cost, not a transient fault and not a DSQL limitation. A per-operation harness opened a fresh connection per write, paying a TCP handshake, a mandatory TLS handshake, the Postgres startup exchange, and first-use credential resolution, on top of public-internet RTT from a Utah client to us-east. The DSQL auth token is signed locally from IAM credentials, so token generation was not the bottleneck; the fix is connection reuse and runtime co-location, not retries. The deployed app does not share the spike's conditions: Vercel functions default to iad1 (us-east-1), co-located with the cluster over the AWS backbone. Decision: (1) pin Vercel functions to us-east-1 via `vercel.json` `regions: ["iad1"]` so runtime co-location with the DSQL cluster cannot drift; (2) enable Fluid Compute and define the pg pool in global module scope so connections are reused across invocations on a shared instance, using `attachDatabasePool` to release idle connections before suspension; (3) keep at least one live connection to both the primary and survivor region pools via a lightweight `SELECT 1` keep-alive on a staggered interval, so judge-triggered failover reuses a warm socket, with a Vercel Cron warm-up endpoint as a supplement; (4) set pool `maxLifetime` comfortably under the DSQL one-hour session cap, with jitter, and stagger keep-alives and recycles to avoid simultaneous re-establishment that could exhaust the 100-connection-per-second rate limit; (5) mint the IAM auth token per connection, never per query, via the AWS Node.js DSQL signer (`getDbConnectAdminAuthToken`), since established sessions are unaffected by token expiry and warm pooled connections incur no per-query token cost; (6) re-measure warm cross-region write latency pooled, n>=200, from EC2 or Lambda in us-east-1, separating connect cost from commit cost, and admit no latency figure into the submission write-up until it has been measured warm. Caveats: a cron-warmed instance is not guaranteed to be the instance a judge's request lands on under scale-out, and Fluid Compute narrows but does not close that gap, so the recorded clean demo take is the guaranteed evidence of failover, independent of live warmth. References: DSQL connection and token model (docs.aws.amazon.com/aurora-dsql/latest/userguide/accessing.html); DSQL connection-pooling best practices (aws.amazon.com/blogs/database/amazon-aurora-dsql-connections-drivers-strings-and-best-practices); Vercel connection pooling with Fluid Compute (vercel.com/kb/guide/connection-pooling-with-functions). Refines DEC-006 (spike to product failover); supersedes nothing.
- **DEC-016 (2026-06-08): Workspace tenancy and collaboration.** Decision: tenancy is a workspace keyed by `org_id` (additive only, no event-model redesign), private by default, shareable by link or code for collaborative sessions, with an optional preloaded demo workspace. Rationale: a coordination tool is inherently multi-user, so isolation prevents compare-notes confusion between judges, while a shared workspace demonstrates the product itself; one shareable-workspace lever serves both. Implementation: a one-field onboarding ("name your workspace") creates an `org_id` and seeds two or three realistic incidents; join-by-link or code lets a team of judges share one workspace (fresh per code); an optional `/demo` workspace is preloaded and reset to seed on a schedule (the monitor or a cron) so it does not rot over the judging window; the workspace name shows persistently in the header; scripted-alarm ingestion routes into the active workspace or a clearly labeled shared alarms feed. Near-real-time reads: the war-room list polls every two to three seconds so a second screen updates on its own (the baseline that makes a shared war room land, SSE only if time allows), which also lifts the solo view. Caveat: there is no authentication, the documented scope cut from the SOW; the openness is intended for judge testing. Refines DEC-004 (event-sourced model) and the WP-6 frontend; supersedes nothing.
- **DEC-017 (2026-06-08): Dashboard scope and observability-surface philosophy.** Context: the live war room reads light and busy, a scrolling activity feed with no insight, bare count tiles with no semantics, and incidents rendered as appending text; the tension being resolved is that a production tool offloads deep metrics to Grafana or Datadog, but a three-minute judged demo needs the value consolidated in one view. Decision: Quorum is the coordination layer that must survive when observability fails, not an observability tool; the dashboard shows only the survival-critical signal and the health of the control plane across regions, and deliberately defers the per-service metrics firehose to the operator's existing stack, stated in the UI as an architectural choice rather than a gap. Design rule: every dashboard element must either make the multi-region DSQL behavior legible or make the incident-to-signal-to-service relationship legible; everything else is removed. Consequences: remove the activity ticker; add a control-plane panel as the centerpiece (region tiles, consistency proof, failover state, cost) wired to real monitor and cost data; top tiles carry semantics and a descriptor, with "signal" defined as an ingested monitoring event that can open or update an incident; the incident view shows the opening signal, the affected service, the append-only timeline, the projected state, and cross-region identical status; the dashboard is the live canvas for the judge-triggered failover and must react visibly to it. References: refines DEC-011/012 (monitor and observability) and DEC-016 (workspace tenancy); supersedes nothing.
- **DEC-018 (2026-06-08): Interactive proof and demo integrity for the control-plane panel.** Context: DEC-017 shipped the control-plane panel, but its headline metrics are displayed rather than produced; the cross-region latency reads "36 ms" statically in three places (the write tile, the consistency tile, and an explanatory paragraph), which reads as redundant and, to a database-specialist judge, as potentially hardcoded; static round numbers read as mock data while real measurements jitter, the page leans on prose that restates the tiles, and the demo workspace currently carries scratch data. Decision: the live site's job is to let a judge produce the proof, not read a claim; the headline DSQL numbers become judge-triggered measurements that vary per run, the explanatory prose shrinks to labels and one framing line, and the demo workspace is seeded with realistic, auto-reset data so it always presents as a product; this extends the DEC-017 design rule, preferring evidence the judge generates over evidence the page asserts. Consequences: a judge-triggered "run a cross-region write" action performs a real write and reports the actual committed, replicated, and read-back latency of that operation, varying each click; the write-latency and cross-region-consistency tiles are differentiated and fed from live measurements so they never read as the same number; the explanatory paragraph is removed, leaving the deferral line and a single one-line failover prompt; the demo workspace is seeded with a realistic incident (real title, CloudWatch-alarm opening signal, named affected service, realistic note) and reset on a schedule, with at least one seeded incident auto-created through the alarm-ingestion path so its opening signal is populated; a concurrent-write burst action reports all committed, zero conflicts, and the latency spread; a live mini architecture diagram (two regions plus witness, replication arrows, serving node lit) reacts to failover; a short "Try this" strip points at the failover; and polish makes failover and consistency the hero tiles, makes re-acknowledging an already-acknowledged incident a no-op that appends no event, and confirms empty states and a mobile-passable layout. References: extends DEC-017 (dashboard scope and observability-surface philosophy); refines DEC-011/012 (monitor) and DEC-005 (idempotency, for the re-ack no-op); supersedes nothing.
- **DEC-019 (2026-06-08): Seed all landing spots, clarify metric provenance, reframe cost.** Context: after DEC-018 the live numbers are real, but three issues remain; the control plane shows two cross-region numbers with no indication of which action produced each (the cross-region tile is driven by run-a-write, the confirmation line by the 50-write burst), which reads as inconsistent; the cost display "spend $0.00 / $20" shows an internal budget cap that is meaningless to a judge and reads unclearly; and only the /demo workspace is richly seeded, so a judge who creates their own workspace from the splash lands in an empty room. Decision: (1) seed all landing spots, every newly created workspace is seeded at creation with a standard set of realistic, signal-linked incidents, including one alarm-shaped incident with its opening signal and affected service populated, so no judge lands empty regardless of entry point, and the /demo workspace additionally resets to clean seeded state on a schedule; (2) tie every live number to the action that produces it, run-a-write and the burst each own a result block co-located with its trigger, with no floating shared numbers, so a judge always knows which click produced which figure; (3) reframe cost rather than scrap it, remove the internal "/$20" budget denominator from the UI and show the real running cost with scale-to-zero context, because near-zero cost on multi-region active-active is a genuine differentiator stated plainly rather than as a budget bar. References: extends DEC-017 and DEC-018; refines DEC-016 (workspace tenancy, for create-time seeding); supersedes nothing.
- **DEC-020 (2026-06-08): Cost-line as a live free-tier gauge, session pre-warm, and failover produces a number.** Context: three refinements after DEC-019; the cost line "running ~$0.00/mo" reads as a static estimate and, never moving, risks looking hardcoded; the DEC-015 cold path still bites the first interaction after a deployment has been idle, because a Vercel instance spins down and the in-instance keep-alive dies with it; and failover is the one DSQL superpower still shown as state (a serving-badge flip) rather than a judge-produced number. Decision: (1) replace the cost line with a live free-tier gauge showing real month-to-date DPU consumed against the 100,000 free allotment plus the resulting spend, sourced from the cost-checker via the DSQL status snapshot, so the figure moves with usage and reads as measured, with the production-volume cost model kept in the docs and video rather than on the panel; (2) pre-warm on tenant entry, when a war room loads fire a background warm-up against both region pools so the instance the session landed on is warm before the first deliberate click, and keep a baseline warm by having the dsql-monitor ping the Vercel warm-up endpoint on its schedule, with no warm-up disclaimer in the UI; (3) failover produces a number, when a judge triggers Simulate outage measure and show the real time for the session to fail over to the survivor, replacing the removed static failover constant, so failover yields a live figure consistent with run-a-write and the burst. References: refines DEC-015 (warmth) and DEC-017/018/019 (control-plane panel); supersedes nothing.
- **DEC-021 (2026-06-08): No-split-brain proof, strong consistency under contention made visible.** Context: the panel proves latency, failover, throughput, and cost, but the defensible kernel, strong consistency under contention with no split-brain across regions, is only implicit; the burst's zero-conflicts reads as throughput, not correctness; for a database-judge panel, strong-consistency-under-contention is the most impressive DSQL property and it is currently underplayed. Decision: make the kernel visible with an adversarial proof; add a conflict-race action that launches two concurrent conflicting state transitions on the same incident across the two regions, DSQL's OCC resolves to one deterministic, single-valued truth, the existing 40001 retry reconciles the loser, and the result reads back identical from both regions; reframe the burst as a divergence proof by reading both regions after the run and showing them identical; elevate the existing cross-region read-back as the read-your-writes-across-regions proof; all three use the real write path, nothing is simulated. References: extends DEC-017/018/019 (control-plane panel) and DEC-005 (idempotency/OCC); supersedes nothing.
- **DEC-022 (2026-06-08): Cross-region route pre-warm, visual race, and race-as-incident-log.** Context: three refinements before the UI freezes; the cross-region read-your-writes route cold-starts on first use, so a judge's first click can show around 300ms before it normalizes to roughly 16 to 50ms, a credibility hit; the split-brain race explains its result in a paragraph rather than showing it; and the race runs on an abstract proof_race row, disconnected from the product's own incident model and its append-only timeline. Decision: (1) pre-warm the real cross-region route, not just the pools, on war-room mount run one throwaway write-then-read-from-the-other-region cycle against a dedicated row so the judge's first measured click is warm, and do not cap or hide the number; (2) show the race instead of explaining it, replace the paragraph with a two-region visual where each region shows its attempted value, the loser flashes a conflict, and both snap to the single agreed value with a no-fork check, demoting the mechanism detail (the 40001, the retry count, the version) to a small secondary line or tooltip; (3) reflect the race in an incident, point the race at a dedicated, clearly-labeled demonstration incident instead of the proof_race row, keeping the version-guarded conditional transitions so the OCC conflict stays genuine, with strong consistency linearizing the conflicting transitions into one ordered history, the incident's append-only timeline showing that single committed sequence, reading it from both regions showing it identical, and the rolled-back loser not appearing (which is itself the proof), resetting the demonstration incident each race and keeping it labeled and separate so it does not clutter the real incident list. References: extends DEC-017 through DEC-021 (control-plane panel); refines DEC-005 (idempotency/OCC) and DEC-015/020 (warmth); supersedes the proof_race row from DEC-021, now a demonstration incident.
- **DEC-023 (2026-06-08): Chaos-state-aware proofs, no transacting with the down region.** Context: a judge who fails a region and then runs a proof sees the proof transact with the region marked down; the clearest break is run-a-write reporting a read-back from us-east-1 while us-east-1 shows DOWN, and the race and both-regions burst claiming both regions read identical while one is unreachable; the chaos toggle steers the serving display but the proof actions ignore it, so the demo contradicts itself, which reads as sloppy or staged. Decision: the chaos state must govern the proof actions, not just the display; when a region is marked down for the session, no proof action transacts with it or claims agreement from it; run-a-write and the burst adapt to survivor-only operation with witness-quorum framing, the two-region race steps aside with a resume-on-restore note, and the read-your-writes tile shows the survival state; the outage stays a session-scoped simulation, which the existing "failover active" framing already conveys, so no new label is required. Consequences: all proof endpoints (run-a-write, the race, the burst, and the read-back) read the session chaos/failover state; during a simulated outage, with the down region being whichever the session failed and the survivor being the other, run-a-write routes to the survivor only and reports "committed to <survivor>, durable via the us-west-2 witness quorum, X ms" with no read from the down region, the burst runs survivor-only and reports "N of N committed to <survivor>, durable via quorum, 0 conflicts" dropping the both-regions-read claim, the two-region race steps aside (disabled or greyed) with a positive note "us-east-1 is down for this session, cross-region proofs resume on restore", and the read-your-writes tile shows the survival state ("us-east-1 unreachable, serving from us-east-2") instead of a cross-region number; on restore every proof returns to full cross-region behavior; in no chaos state does any proof read from, or claim agreement from, a region marked down. References: refines DEC-021 and DEC-022 (the proof actions and the chaos toggle); supersedes nothing.
- **DEC-024 (2026-06-10): Drill incidents, productized surfaces, in-genre restyle, ephemeral demo provisioning.** Context: four issues close out development; first, a previously drafted decision was never implemented, simulating a region outage flips serving but opens no incident, so the product's central recursion, coordinating the very failure the control plane is surviving, does not exist, and the demo org accrues monitor and e2e smoke alarm incidents between resets; second, the war room mixes the product with the proof apparatus in one undifferentiated panel, reading as a demo harness rather than a shippable B2B product; third, visual execution is utilitarian against a criterion that scores Design as a quarter of the total; fourth, the shared /demo tenant breaks under independent judges arriving at unpredictable times, one judge's scratch pollutes the next judge's first impression. Decision: (Part 0) make the demo self-referential, a failover drill opens a clearly labeled, real, idempotent region-impairment incident the operator coordinates from the survivor, restoring resolves it, and ingest is scoped so only intentional demonstration alarms open incidents in the showcase org; (Part A) productize the showcase, the war room becomes the calm product surface with a live control-plane status band while a Reliability surface holds the apparatus under product language, moving not removing and renaming not diluting, behavior and claims identical; (Part B) restyle within the ops-dark genre, v0 as stylist and this engineer as surgeon, after revising the draft v0 prompt to cover both surfaces and the full apparatus; (Part C) replace the shared demo landing with ephemeral provisioning, one click creates a fresh auto-named fully-seeded workspace, /demo becomes the canonical zero-click front door, and the old org is retained unlinked as the live-ingest showcase. Consequences: Part 0 and Part C ship regardless; the presentation reorganization ships via the fallback ladder (rung 1 full reorg plus restyle, rung 2 single-page hard-zoned apparatus plus restyle, rung 3 pure restyle, rung 4 current UI), and the achieved rung is recorded in STATUS and the handoff report. References: extends DEC-016 through DEC-023; builds on the DEC-019 seed routine and the DEC-023 chaos-state awareness; supersedes the shared /demo as the public landing.
- **DEC-025 (2026-06-10): Chaos-immune provisioning, guaranteed restore, label-action integrity, coherent Reliability flow.** Context: final review found four demo-path defects; first, with both regions marked down by the session chaos cookie, /demo returns HTTP 500 because the provisioning path honors chaos state, so a judge who explored the drill can brick their own front door; second, with both regions down, the restore controls can become unreachable if the Reliability surface depends on a serving region to render, leaving a trap state whose escape instructions point at a page that may not load; third, the war-room checklist items and the status-band button are labeled as actions ("Run a failover drill") but only navigate, a label-behavior mismatch in a product whose core discipline is that nothing on screen misrepresents what it does; fourth, the Reliability page accreted in DEC order rather than being designed, the race card splits the state zone from the verification tools, the usage figure is an unlabeled orphan line between two proofs, the guidance box sits below the things it guides, and the DEC-024 section headers never visibly shipped. Decision: provisioning is chaos-immune and resets chaos; restore is reachable from any state without a database read; every clickable's label matches its effect, with the status-band drill button executing in place so the drill-to-incident recursion happens on the product surface itself; both-regions-down remains a reachable, honestly-explained state with a guaranteed exit; the Reliability page is reordered into a designed arc, state, verification, contention, drills, usage, under visible product section headers, with the redundant on-page checklist removed. References: refines DEC-024 (surfaces, drill incidents, provisioning) and DEC-023 (chaos-state awareness); supersedes nothing.
- **DEC-026 (2026-06-10): Truthful both-down proofs, single-destination checklist, visible anchor arrival.** Context: with both regions marked down, the proof actions interpolate a null survivor into their claims ("commits go to none, durable via quorum", "write commit (survivor none)", "serving from none"), asserting commits that cannot occur in the one state where the war-room banner correctly explains that no region can serve until one recovers; separately, the war-room checklist has two links to the same destination, and on a page too short to scroll, the #verification anchor produces no visible change, so distinct links yield identical results and read as broken. Decision: in the no-serving-region state, every proof that writes steps aside with the same resume-on-restore pattern the race already uses, and no copy anywhere interpolates a null survivor, the vocabulary following the banner, committed data is safe via the witness and new writes resume when a region recovers; the checklist carries exactly one navigational link, and anchor arrival is made visible with a brief highlight on the target section instead of relying on scroll. References: refines DEC-023 (chaos-state awareness), DEC-024 (checklist), and DEC-025 (label-action integrity, flow); supersedes nothing.

**11.2 Change log.** One line per material change to the plan. Date, what changed, why.

- 2026-06-06: Document created. Initial scope, architecture, and schedule locked.
- 2026-06-07: WP-0 spike built and validated locally (infra/spike + packages/spike-failover; terraform validate, strict tsc, 10/10 unit tests). AWS apply/run deferred on the account verification window. Added DEC-007 (raw pg for the spike) and DEC-008 (docs/ public-safe, docs/private/ for operational detail; AUDIT.md moved, PROVENANCE redacted). SOW relocated to docs/SOW.md.
- 2026-06-07: Added DEC-009 (Vercel CLI-deploy-only policy). Promoted the decision-log protocol into CLAUDE.md (new "Decision governance" + "Vercel deployment policy" sections) and added scripts/preflight-vercel.sh (account-mismatch guard).
- 2026-06-07: WP-0 failover spike APPLIED and **PASSED** (C1 strong consistency, C2 active-active, C3 region-failure survival; cross-region write median 754 ms / p99 994 ms, n=50). Go/no-go gate (§7.1) = **GO**, DSQL multi-region thesis validated; code carries forward (DEC-006).
- 2026-06-07: WP-2 data layer, schema migrations 0001–0004 (service, signal, incident, incident_event) + Kysely types in packages/db (DEC-010), on the spike-proven client/OCC. Built the scheduled Lambda monitor next (DEC-011).
- 2026-06-07: Added DEC-011 + `functions/dsql-monitor` (scheduled Lambda reusing the WP-0 claims) and `infra/monitor` (Lambda + EventBridge schedule + CloudWatch alarms) to automate the consistency/active-active/failover/latency checks against live DSQL, continuous monitoring, no manual runs.
- 2026-06-07: DEC-012, the DSQL monitor is repurposed as a live observability layer for the demo + judging window (war-room UI reads Quorum/DSQLMonitor metrics; isolated probe table; within budget). Bundle confirmed loadable. Carrying on with WP-3.
- 2026-06-07: Added WP-12, editorial and hygiene pass with pre-submission and public-flip modes, as a Phase 5 gate and a precondition for any public flip.
- 2026-06-07: Ran WP-12 editorial pass (MODE=pre-submission). Mechanical hygiene fixes applied (unicode ASCII-fold, markdown voice pass, username-path redaction, .env.example fix, tooling and configs); fresh-clone gate PASS; report at docs/EDITORIAL-2026-06-07-pre-submission.md. Result PASS, 2 minor items for review.
- 2026-06-07: Frontend compliance check (h01.devpost.com rules): the hard requirement is to DEPLOY the front end on Vercel or v0.app and use an AWS database (we use Aurora DSQL). Building with v0 is optional/encouraged, not mandatory, so WP-6 ships a Next.js app deployed on Vercel with v0 as optional polish.
- 2026-06-07: Built the full pure-CC vertical (WP-3 OCC, WP-4 domain, WP-5 API, the region-failover data layer carrying DEC-006 into the app, WP-7 ingestion fn+infra, WP-8 app IaC, WP-10 seed, WP-6 war-room frontend, WP-9 chaos hook, WP-11 gated integration tests) plus the Vercel deploy path. 47 tests. Remaining: go-live (persistent infra + Vercel deploy + AWS keys for the Vercel runtime).
- 2026-06-07: Drafted the go-live control plane: infra/bootstrap (tfstate + budget + alarms), quorum-vercel IAM, easy golive/teardown/status scripts (S3 backend via gitignored override), and `.claude/skills/*` (golive, teardown, chaos, deploy, status). Added DEC-013 (chaos homegrown-primary, FIS optional) and DEC-014 (ops via Claude skills).
- 2026-06-07: Added DEC-015 (DSQL connection lifecycle and demo-path warmth): the spike's cross-region latency was cold-connection cost, not a DSQL limit; the deployed app pins to us-east-1, reuses warm pooled connections, and re-measures warm before any latency figure enters the write-up. Refines DEC-006.
- 2026-06-08: Added DEC-016 (workspace tenancy and collaboration): workspaces keyed by org_id, private by default, shareable by link/code, an optional reset-on-schedule demo workspace, the workspace name in the header, alarm ingestion routed per workspace, and 2-3s polling for near-real-time shared war rooms. Refines DEC-004 + WP-6.
- 2026-06-08: Added DEC-017 (dashboard scope and observability-surface philosophy): Quorum is the coordination plane, not an observability tool; the dashboard shows only control-plane survival signal (region tiles, consistency proof, failover state, cost) read from a DSQL status snapshot through the failover layer, removes the activity ticker, gives tiles semantics with "signal" defined in-product, surfaces the signal/service/incident relationships, and defers per-service metrics to Grafana/Datadog. Refines DEC-011/012 + DEC-016.
- 2026-06-08: Added DEC-018 (interactive proof and demo integrity): headline DSQL numbers become judge-triggered, per-run measurements (run-a-write reports real commit + cross-region confirm + read-back latency; concurrent burst reports all-committed/zero-conflicts/spread); the write and consistency tiles are differentiated and live; the explanatory paragraph is removed; the demo workspace is seeded realistic + auto-reset with an alarm-ingested incident; a live mini architecture diagram + a Try-this strip; re-ack is a no-op. Extends DEC-017.
- 2026-06-08: Added DEC-019 (seed all landing spots, clarify metric provenance, reframe cost): every created workspace is seeded at creation with realistic signal-linked incidents including an alarm-shaped one (so no judge lands empty); run-a-write and the burst each own a co-located result block (no floating shared numbers); the cost line drops the /$20 denominator and shows the running cost with scale-to-zero context. Extends DEC-017/018, refines DEC-016.
- 2026-06-08: Added DEC-020 (cost gauge, session pre-warm, failover number): the cost line becomes a live free-tier gauge (month-to-date DPU vs 100K free + spend from the cost-checker via the DSQL snapshot); war rooms pre-warm both region pools on mount and the dsql-monitor pings the Vercel warm-up endpoint each run so the first deliberate click lands warm; Simulate outage measures and shows the real failover time, replacing the static constant. Refines DEC-015 + DEC-017/018/019.
- 2026-06-08: Added DEC-021 (no-split-brain proof, strong consistency under contention): a conflict-race action launches two concurrent conditioned state transitions on one item across both regions, DSQL OCC resolves to one truth with the existing 40001 retry reconciling the loser, and both regions read back identical (two writers, one truth, no split-brain); the burst is reframed as a divergence proof (both regions read identical post-run); the cross-region read-back is elevated as the read-your-writes-across-regions strong-consistency proof. Extends DEC-017/018/019 + DEC-005.
- 2026-06-08: Added DEC-022 (cross-region route pre-warm, visual race, race-as-incident-log): the war room pre-warms the exact cross-region read-your-writes route (a throwaway write-then-read cycle on mount) so the first click is warm; the split-brain race becomes a two-region visual (each region shows its attempt, the loser flashes a conflict, both snap to one agreed value, no-fork check) with the mechanism demoted; and the race targets a dedicated demonstration incident whose append-only timeline shows the single linearized committed history read identical from both regions, the rolled-back loser absent. Extends DEC-017..021, refines DEC-005 + DEC-015/020, supersedes the DEC-021 proof_race row.
- 2026-06-08: Added DEC-023 (chaos-state-aware proofs, no transacting with the down region): when a region is failed for the session, the proof actions stop transacting with it; run-a-write and the burst go survivor-only with witness-quorum framing (no read from the down region, no both-regions claim), the two-region race steps aside with a resume-on-restore note, and the read-your-writes tile shows the survival state; on restore all proofs return to full cross-region behavior. Refines DEC-021/022.
- 2026-06-10: Added DEC-024 (drill incidents, productized surfaces, in-genre restyle, ephemeral demo provisioning): a failover drill opens a real, idempotent, clearly-labeled region-impairment incident coordinated from the survivor (restore resolves it) and ingest is scoped so only the apigw-5xx demonstration alarm opens showcase incidents (monitor + smoke alarms excluded); the war room becomes the product surface with a control-plane status band and a Reliability surface holds the apparatus under product language; an in-genre restyle (v0-assisted, prompt revised); and the splash + /demo provision a fresh seeded workspace per judge (shared demo retained unlinked as the live-ingest showcase). Ships via a fallback ladder; Part 0 + Part C regardless. Extends DEC-016..023.
- 2026-06-10: Added DEC-025 (chaos-immune provisioning, guaranteed restore, label-action integrity, coherent Reliability flow): provisioning (/demo + splash) writes through the real pools unconditionally and clears the session chaos cookie so a fresh workspace starts healthy (fixes the both-down /demo 500); the Reliability drill/restore controls derive from the chaos cookie alone (no DB-read gate) and the war-room no-serving-region banner gains an inline End-drills-restore exit; the status-band drill button executes in place (label matches effect) and the checklist is rephrased honestly; the Reliability page is reordered into Control plane / Live verification / Consistency under contention / Failover drills / Usage under visible headers, the on-page Try-this removed. Refines DEC-024 + DEC-023.
- 2026-06-10: Added DEC-026 (truthful both-down proofs, single-destination checklist, visible anchor arrival): when both regions are down, run-a-write and the burst step aside like the race (disabled, "No serving region for this session; proofs resume on restore. Committed data is safe via the us-west-2 witness.") and no copy interpolates a null survivor; the war-room checklist carries exactly one navigational link with two plain steps; and a CSS :target highlight pulses the arrived-at Reliability section. Refines DEC-023/024/025.

---

## 12. Compliance and evidence

Items to satisfy per the official rules, tracked here for the verification step.

- **Eligibility:** Above age of majority, not in an excluded country. United States resident, satisfied.
- **New or existing:** Greenfield project built entirely inside the May 27 to Jun 29 window. The integration is used in June. Satisfied.
- **Evidence of work in window:** Intact commit history is the primary evidence. Do not squash.
- **Required submission items:** D-1 through D-6 in Section 6.1.
- **Original work and ownership:** All code authored by the entrant or generated under the entrant's direction, solely owned, no third-party rights violated.
- **Project availability:** Reachable and free to access through 2026-07-24.
- **Verification readiness:** Be able to demonstrate authorship and explain the build if requested.

---

## Appendix A: key facts and links

**Deadlines:**

- Registration and submission: May 27 to Jun 29, 2026, 5:00pm PDT.
- Credit request form: by Jun 26, 2026, 12:00pm PT.
- Judging: Jun 30 to Jul 24, 2026.
- Winners: on or around Jul 31, 2026.

**Credits:**

- Hackathon: $100 AWS promotional credits (expire 2026-12-31), $30 v0 credits (redeem by 2026-07-13).
- New AWS account: $100 on sign-up plus up to $100 earned, both plans.
- DSQL free tier: 100,000 DPUs and 1 GB storage per month, scales to zero.

**Prize structure (each project wins at most one prize):**

- Per track: first $10,000, second $5,000, third $3,000, each matched in AWS credits.
- Best-of awards: Best Technical Implementation, Best Design, Most Impactful, Most Original, each $2,000 plus $2,000 credits.

**Scoring:**

- Four equally weighted criteria (Technical Implementation, Design, Impact and Real-world Applicability, Originality), base score to 5.0.
- Bonus content up to 0.6. Final range 1.0 to 5.6.

**Required submission artifacts:** text description, demo video under 3 minutes on YouTube, published Vercel project link and Team ID, architecture diagram, storage-configuration screenshots.

**Key URLs:**

- Hackathon: h01.devpost.com
- Rules: h01.devpost.com/rules
- Build with v0: v0.app
