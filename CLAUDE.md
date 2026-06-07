# Project Quorum, Engineering Context (LOCKED)

Incident command plane on **Aurora DSQL** (multi-region), built for the H0 hackathon.
This file is loaded into every Claude Code session. The decisions below are **locked**,
do not relitigate them; implement against them.

## Platform & access

- **AWS profile:** `h0` (`AWS_PROFILE=h0`). Account ID kept in `docs/private/` (out of this public-bound file).
- **Regions:** `us-east-1` + `us-east-2` active; `us-west-2` witness.
- **Destructive operations always require explicit user approval**, deleting/modifying AWS
  resources, dropping/altering data, rewriting git history. Read-only by default.
- **Secrets never** appear in code, the repo, logs, or model output. No exceptions.

## Language & data access

- **TypeScript end to end.** No other application languages.
- **Kysely over `node-postgres` (`pg`). No ORM.** Typed, hand-written SQL through Kysely.

## Migrations

- **Hand-authored SQL** migration files, no framework that generates DDL.
- **Exactly one DDL statement per transaction, with an explicit `COMMIT` per statement.**
  DSQL does not allow batching DDL or mixing DDL with DML in one transaction.
- **`CREATE INDEX` is `ASYNC` only.** Never a synchronous index build.
- Statements inside a migration file are separated by a line containing only `--;`.

## Schema rules

- **No foreign keys.** Referential integrity is enforced in the application layer.
- **No sequences.** Primary keys are **random UUID v4**, chosen for write distribution
  (an ordered key would create a hot partition).
- **`event_id` (UUID) is both the primary key and the idempotency key.** A duplicate-key
  insert (SQLSTATE `23505`) is treated as **success**, not an error.

## Transactions & concurrency

- **Isolation is Repeatable Read and cannot be changed.** Never emit
  `SET TRANSACTION ISOLATION LEVEL`, DSQL only supports Repeatable Read.
- **Optimistic concurrency control:** on serialization failure (SQLSTATE `40001`), **retry
  with exponential backoff + jitter.**
- **Reads are never wrapped** in the OCC retry/transaction helper, only writes.

## DSQL authentication

- Connection auth uses **short-lived IAM tokens** (`@aws-sdk/dsql-signer`), supplied as the
  libpq password. TLS is required.
- **Generate a token per connection**, behind a **TTL cache** so we don't re-sign on every
  connection; refresh before expiry.

## Repo conventions

- pnpm workspaces: `apps/` (services), `packages/` (libraries), `functions/` (Lambdas),
  `infra/` (Terraform), `scripts/`, `docs/`.
- Conventional commits. **Granular commits. Never squash or rewrite history**, git is part
  of the provenance trail.
- Later Terraform stacks use the S3 backend with `use_lockfile = true` (native S3 locking,
  **no DynamoDB lock table**). The `infra/bootstrap` stack keeps its own state **local and
  gitignored** (chicken-and-egg).

## Vercel deployment policy

- This project deploys to a **dedicated Vercel account via CLI only** (DEC-009). **Never**
  connect a Git provider to this Vercel account, **never** use the dashboard import flow, and
  **never** enable or suggest push-to-deploy.
- Before any `vercel` command that mutates state (`link`, `deploy`, `env`, `rm`, `promote`,
  `alias`), run `scripts/preflight-vercel.sh` and **stop on a nonzero exit**.
- `vercel deploy` for previews, `vercel deploy --prod` for production, always with the project
  linked at `apps/web`.
- This machine may at times hold a CLI session for a **different, production** Vercel account.
  The preflight check is **not optional and is never skipped for speed**.

## Decision governance

- Material decisions (architecture, tooling, scope, security posture, external accounts,
  anything a future maintainer would ask "why" about) require a **DEC entry in `docs/SOW.md`
  §11.1**, committed with or before the implementing change. Plan changes get a one-line Change
  Log entry in §11.2.
- DEC entries are **append-only, sequentially numbered, dated**. Never edit, renumber, or delete
  an existing entry. **Git history is the integrity layer, which is why history is never
  rewritten or squashed.**
- If you hit a material decision mid-task with no covering DEC entry: draft the entry, present it
  for user approval, and **do not implement until approved**. Minor implementation details need
  no entry; when unsure, ask.

See `docs/PROVENANCE.md` (action log) and `docs/private/AUDIT.md` (account audit).
