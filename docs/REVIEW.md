# Quorum, multi-expert validation pass

A senior-level review of the whole system across seven lenses: AWS Well-Architected, Node/
TypeScript, relational/Postgres, Aurora DSQL, distributed systems / SRE, frontend/Next.js, and
security. Honest, not a victory lap: strengths and real findings, each tagged by severity
(**P0** ship-blocker, **P1** before submission, **P2** nice-to-have / post-hackathon), with a
prioritized action list at the end.

**Overall verdict:** architecture is sound and unusually disciplined for a hackathon (strict
types, hand-authored SQL respecting every DSQL constraint, idempotent event sourcing, real
multi-region failover, secrets hygiene). The material risks are operational, not structural:
connection warmth on the demo path (already DEC-015), static AWS keys in the Vercel runtime, and
the read-side projection cost at scale. None block the demo; two are worth closing before
submission.

## 1. AWS Well-Architected

- **Operational excellence (strong):** everything is IaC + an idempotent ops control plane
  (`/golive`, `/teardown`, `/status`, `/chaos`, `/deploy`, `/e2e`, `/wipe`), a live monitor, and a
  reusable editorial gate. **P2:** no CI; the gates run locally. A small GitHub Action (typecheck /
  test / `terraform validate` / gitleaks) would make the green bar continuous.
- **Security (strong, see Section 7).**
- **Reliability (strong):** active-active across two Regions with a witness, client-side failover,
  idempotency + OCC. **P1:** failover is sticky with no automatic fail-back, fine for the demo, but
  prod wants health-based fail-back. **P1:** cold-survivor failover pays a fresh connect (DEC-015).
- **Performance efficiency:** the DSQL connection lifecycle is the headline (DEC-015). **P2:**
  `listIncidents` projects each incident from its event log (N+1); fine at demo scale, a
  materialized `incident_projection` is the scale answer (already deferred in DEC-004).
- **Cost optimization (strong):** scale-to-zero DSQL, free-tier Lambdas, a $20 budget + billing
  alarm, and the new wipe tooling for storage during testing.
- **Sustainability:** scale-to-zero idle footprint.

## 2. Node / TypeScript

- **Strong:** strict compiler settings (`noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`),
  Biome clean, and a deliberate pure/impure split, `projectIncident`, `runWithFailover`,
  `parseAlarmEvent`, and the service validators are pure and unit-tested without a database.
- **P1:** the failover `run()` re-executes `fn` on the survivor; this is only safe because writes are
  idempotent on the event id. It is documented, but a stray non-idempotent side effect inside an
  `fn` would double-apply. Keep domain calls inside `run()` idempotent by construction.
- **P2:** the app has no structured request logging or error tracking; the monitor watches the DB,
  not app requests. A thin logger / error boundary would help in prod.

## 3. Relational / Postgres

- **Strong:** clean four-table model, random UUID PKs for write distribution, `CREATE INDEX ASYNC`,
  OCC on 40001, and idempotency via the primary key (removes any dependence on `ON CONFLICT`
  semantics).
- **P2:** no foreign keys (a deliberate DSQL choice); integrity is enforced in the domain layer.
  Correct, but it is an invariant to guard, the domain is the only thing stopping an orphan event.
- **P2:** `(created_at, event_id)` ordering relies on a server-default timestamp; ties are broken by
  `event_id` deterministically, acceptable. jsonb payloads are unindexed (fine at this scale).

## 4. Aurora DSQL

- **Strong:** every locked DSQL constraint is honored, no FK/sequences, one DDL per transaction with
  explicit commits, `CREATE INDEX ASYNC` only, Repeatable Read untouched, no `TRUNCATE` (the wipe
  batch-DELETEs under the 3000-row/txn cap), IAM-token auth with a TTL cache.
- **P1 (DEC-015):** the spike's ~754 ms median was cold-connection cost (TCP + TLS + Postgres
  startup + first-use credential resolution) over public internet, not a DSQL limit. Production must
  pin runtime to us-east-1, reuse pooled connections, keep both Region pools warm, recycle under the
  one-hour session cap with jitter, and stay under the 100-connection/sec rate limit. The benchmark
  (`pnpm --filter @quorum/db bench`) now measures warm vs cold to confirm this before any number
  enters the write-up.
- **P2:** confirm the failover path always lands on a healthy Region; the chaos forces it, real
  outage relies on connection-error detection (`isConnectionError`), which is broad but should be
  spot-checked against real DSQL error shapes during `/e2e`.

## 5. Distributed systems / SRE

- **Strong:** strongly consistent active-active (the witness arbitrates, so no split-brain),
  idempotency makes at-least-once ingestion and failover-retry safe, and the chaos demo exercises
  the real failover code path rather than a mock.
- **P1:** warm both Region pools (DEC-015 #3) so judge-triggered failover is a warm-socket hop, not a
  cold connect. This is the single biggest lever on the demo's perceived speed.
- **P2:** no automatic fail-back; document it as intended.

## 6. Frontend / Next.js

- **Strong:** server components for reads, route handlers for writes, `force-dynamic` to avoid stale
  reads, a per-request session cookie for chaos, and a Tailwind/shadcn-ready UI.
- **P2:** the serving-region label is derived from the chaos cookie (the intended survivor), which
  matches what `run()` does but is not the literally observed connection; acceptable, note it.
- **P2:** no client error boundaries / loading states; v0 polish can add these.

## 7. Security

- **Strong:** IAM-token auth (no static DB passwords), secrets stored outside the repo, gitleaks
  pre-commit + clean full history, a Vercel account-match preflight, least-privilege `quorum-vercel`
  IAM, and account-specific detail confined to gitignored `docs/private/` (DEC-008).
- **P1 (best finding):** the Vercel runtime currently needs **static AWS access keys** to sign DSQL
  tokens, a long-lived credential off-platform. Replace with **Vercel OIDC federation to an AWS IAM
  role** (web-identity trust), so the runtime assumes a role with no static keys. This removes the
  one long-lived secret in the system. If time is short for the hackathon, ship static keys scoped
  to only `dsql:DbConnect` on the two clusters and rotate after, but OIDC is the right end state.
- **P2 (scope, deliberate):** the app has **no authentication**, anyone can create/resolve incidents.
  This is an explicit scope cut (RBAC/SSO are out of scope in the SOW) and is desirable for judge
  testing, but the write-up should state it plainly so it reads as a decision, not an oversight.

## Prioritized actions

- **P1, before submission:**
  1. Close the DEC-015 connection-warmth gap (pin region, Fluid Compute pool, keep-alives, recycle).
  2. Move the Vercel runtime to OIDC -> AWS role, or ship scoped static keys + a rotation note.
  3. Run `/e2e` against the live cluster; record warm write p50/p99 and warm vs cold failover.
- **P2, opportunistic / post-hackathon:** CI workflow; materialized read projection; health-based
  fail-back; request logging; client error/loading states; state the no-auth scope cut in the
  write-up.

No P0 items. The system is demo-ready; the P1 list is what turns a strong demo into a defensible
one when a judge inspects it.
