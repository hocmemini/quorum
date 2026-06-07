# Project Quorum — Provenance Trail

Records every material (state-changing) action taken while preparing the account and
repo. Read-only audit calls are summarized, not exhaustively logged.
**Secrets (access keys, tokens) are never recorded in this file.**

- **AWS account:** `<account redacted; see docs/private>` (IAM principal `<deploy-user>`)
- **Default region:** `us-east-1` · **Project regions:** `us-east-1`, `us-east-2` (active), `us-west-2` (witness)
- **AWS access:** profile `h0` (`AWS_PROFILE=h0`)

---

## 2026-06-07 — Phase 0: Local environment

| Action | Command / detail | Why |
|---|---|---|
| Verified toolchain | `git 2.43.0`, `aws-cli 2.34.63` (v2), `terraform 1.15.5`, `node 24.14.0`, `gh 2.88.1` (authed: `hocmemini`) | Confirm prerequisites |
| Installed pnpm `11.5.2` | `corepack enable && corepack prepare pnpm@latest --activate` | Workspace package manager (was missing) |
| Configured AWS profile `h0` | `aws configure set …` → `~/.aws/credentials` (secret **not** recorded) | Programmatic access |
| Set shell default profile | appended `export AWS_PROFILE=h0` to `~/.bashrc` (profile name only, no secret) | Make `h0` active by default |
| Verified identity | `aws sts get-caller-identity --profile h0` → account `<account redacted; see docs/private>`, user `<deploy-user>` | Confirm access works |

**Security note — credential file perms:** `~/.aws` is a symlink to
`/mnt/c/Users/hocme/.aws` (Windows NTFS surfaced through WSL `v9fs`). Linux `chmod 600`
has **no effect** there; files display `rwxrwxrwx`. Real protection is the Windows ACL on
the user profile (`C:\Users\hocme`), restricted to this user + Administrators by default.
Left as-is per intentional Windows/WSL credential sharing. **Action item: rotate the
`h0` access key after this session** — it was pasted into the chat transcript.

---

## 2026-06-07 — Phase 1: Account audit (read-only) — PARTIALLY DEFERRED

- **AWS auth not yet propagated.** STS recognizes the fresh `h0` key, but EC2/IAM/Cost
  Explorer/etc. return `AuthFailure` / `InvalidClientTokenId`. A 20-minute background poll
  (`describe-regions`) did not clear it — consistent with the up-to-24h reactivation window.
  **Phase 1 AWS data collection is deferred** (see [AUDIT.md](./private/AUDIT.md) for resume commands).
- **Cost Explorer:** 2 calls attempted, both rejected on auth → **$0 billed** (CE charges
  only for processed requests).
- **DSQL multi-region peering: verified via current AWS docs** — `us-east-1` + `us-east-2`
  peered with `us-west-2` witness is the canonical documented configuration. Details + sources
  in AUDIT.md §3.
- **Deliverable ready:** `scripts/audit-sweep.sh` (read-only sweep).

---

## 2026-06-07 — Phase 4: Repo & monorepo scaffold

| Action | Command / detail | Why |
|---|---|---|
| `git init` on `main` | `git init -b main` | Canonical project monorepo |
| Local git identity | name `hocmemini`, email → GitHub noreply | Author commits |
| Scaffold + tooling | pnpm workspaces; strict TS (`tsc` clean); Biome; Vitest; tsx; `packages/db` Kysely+pg client + one-DDL-per-txn migration runner | Per spec |
| Validated toolchain | `pnpm install` (+esbuild build), `biome check`, `tsc --noEmit`, `vitest` — all green | Readiness |
| Installed gitleaks `8.30.1` | `scripts/install-gitleaks.sh` → `~/.local/bin` | Secret scanning |
| Enabled pre-commit hook | `core.hooksPath=.githooks` (gitleaks `git --staged`) | Block secrets from history |
| 5 granular commits | scaffold → tooling → docs → hooks → audit-sweep; each scanned clean | Provenance |
| Created **private** GitHub repo | `gh repo create quorum --private` → `github.com/hocmemini/quorum` | Remote |
| Re-authored 5 commits | `git filter-branch` author+committer email → noreply | **Explicit user approval** (GitHub blocked pushing a private email); content/messages/order unchanged; old gmail commits pruned locally |
| Pushed `main` | `git push -u origin main` | Publish (private) |

**Note on the re-author.** The standing rule is "never rewrite history." This single
email-only rewrite of the 5 **unpushed** setup commits (identical content, messages, order)
was performed **only after explicit user approval**, to keep a private email out of a repo
that goes public later. No work-provenance was lost; history is append-only from here.

---

## 2026-06-07 — AWS Free Tier activity credits pass — FULLY DEFERRED

Attempted the $100 (5 × $20) Free Tier activity-credit pass. **AWS auth had regressed to
full failure** — by 18:58 UTC even `sts get-caller-identity` returned `InvalidClientTokenId`
(earlier in the day STS worked while other services didn't). Stored `h0` key unchanged, no
env-cred interference, credentials file intact → server-side auth state (billing/verification
window), not fixable locally. **No resources were created or destroyed. Nothing billed.**

| # | Activity | Method (when unblocked) | Credit | Status |
|---|---|---|---|---|
| 1 | AWS Budgets | CLI `create-budget` ($20 monthly cost) — permanent | $20 | DEFERRED (auth) |
| 2 | Lambda web app | inline `nodejs22.x` fn + function URL (auth NONE), curl 200, delete | $20 | DEFERRED (auth) |
| 3 | EC2 instance | `t3.micro` from AL2023 SSM AMI, run → terminate | $20 | DEFERRED (auth) |
| 4 | RDS database | PostgreSQL `db.t4g.micro` 20 GB gp3, create → delete | $20 | DEFERRED (auth) |
| 5 | Bedrock | `bedrock-runtime converse` (Nova Micro) + manual console fallback | $20 | DEFERRED (auth) |
| | **Total** | | **$100** | **0 claimed** |

Runnable commands for all five (plus carried-over prep) are consolidated in
[REMAINING.md](./REMAINING.md) for a single future pass.

## 2026-06-07 — WP-0 failover spike build (local; apply + run deferred)

Built the WP-0 gate spike. All local work is complete, validated, and pushed; only
`terraform apply` and the live claims run remain (AWS auth deferred).

| Action | Detail | Why |
|---|---|---|
| Verified DSQL Terraform schema | `terraform providers schema -json` on `hashicorp/aws` v6.49 → `aws_dsql_cluster` + `aws_dsql_cluster_peering` (a guessed `aws_dsql_cluster_multi_region` does **not** exist) | "do not guess" |
| Verified token-signer API | installed `@aws-sdk/dsql-signer` v3.1063.0 → `DsqlSigner.getDbConnect[Admin]AuthToken()` | "do not guess" |
| Reconfirmed region trio | AWS docs: us-east-1 + us-east-2 + us-west-2 (witness) is the documented US set | RISK-6 |
| Wrote `infra/spike` | two peered `aws_dsql_cluster` + witness + IAM connect policy; `terraform fmt/init/validate` pass (no apply) | provision infra |
| Wrote `packages/spike-failover` | pg failover client (token-per-connect, transparent failover, OCC on 40001), one-DDL-per-txn migration, C1/C2/C3 claims + latency, report + teardown scripts | the spike |
| Validated locally | strict `tsc` clean · Biome clean · **10/10 vitest** unit tests pass (failover + OCC, no AWS) | confidence before apply |
| Moved SOW → `docs/SOW.md` | per the SOW's own convention; ignored `*:Zone.Identifier` artifacts | provenance |

**Remaining for WP-0 (needs auth):** `terraform -chdir=infra/spike apply` → wire `.env` →
`pnpm --filter @quorum/spike-failover report` → commit `SPIKE_RESULTS.md` → `scripts/teardown-spike.sh`.

## 2026-06-07 — Public-safe pass + spike hardening (DEC-007, DEC-008)

| Action | Detail | Why |
|---|---|---|
| Moved `docs/AUDIT.md` → `docs/private/AUDIT.md` (gitignored) | untracked from HEAD; account id, IAM names, inventory, spend leave the public tree | DEC-008 |
| Redacted account-specific identifiers | account id + IAM username → placeholders in CLAUDE.md, this file, REMAINING.md, infra/bootstrap | DEC-008 |
| Spike IAM made public-safe | `connect_user` default `""` + `count` guard; example uses a placeholder (real value in gitignored tfvars) | DEC-008 |
| Added real-hang failover test | `scripts/blackhole.sh` (iptables) + `pnpm … smoke` (`failover-smoke.ts`) | exercise timeout/failover under a true TCP hang before NACL/FIS |
| Re-validated | `terraform validate`, strict `tsc`, Biome, 10/10 vitest — all green | confidence |

_History note: earlier commits already contain pre-redaction identifiers; per the no-rewrite rule, history is unchanged. The public flip is a redaction review or a clean mirror (DEC-008)._

## Consolidated remaining work → [REMAINING.md](./REMAINING.md)

All blocked on the AWS billing/verification window (auth). When `aws ec2 describe-regions`
succeeds, run REMAINING.md top-to-bottom:

- **A.** Free Tier credits (5 activities above) — ephemeral; all destroyed in-pass **except the budget**.
- **B1.** Phase 1 audit (CE spend, `scripts/audit-sweep.sh`, IAM hygiene, DSQL account check) → KILL/KEEP lists → **stop for line-item approval**.
- **B2.** Phase 2 cleanup — gated on B1 approval.
- **B3.** Phase 3 scaffold (account S3 BPA, tfstate bucket, SNS, budget, billing alarm) — gated on approval + **needs your alert email**.
- **C.** WP-0 Aurora DSQL failover spike → `packages/spike-failover`.

**Open user action items:** rotate the `h0` key when done (it was pasted in chat); provide an
alert email for Phase 3; line-item approve the KILL LIST once B1 produces it.
