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
