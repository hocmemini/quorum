# Project Quorum — Provenance Trail

Records every material (state-changing) action taken while preparing the account and
repo. Read-only audit calls are summarized, not exhaustively logged.
**Secrets (access keys, tokens) are never recorded in this file.**

- **AWS account:** `260289091534` (IAM principal `h0-deploy`)
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
| Verified identity | `aws sts get-caller-identity --profile h0` → account `260289091534`, user `h0-deploy` | Confirm access works |

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
  **Phase 1 AWS data collection is deferred** (see [AUDIT.md](./AUDIT.md) for resume commands).
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

## Pending / gated (awaiting user)

- **Phase 1 AWS data** (CE spend, resource sweep, IAM/security, account-level S3 BPA, DSQL
  account availability) — deferred until auth propagates; resume per AUDIT.md.
- **Phase 2 cleanup** — gated on line-item approval of the AUDIT.md KILL LIST (not yet
  producible).
- **Phase 3 AWS scaffold** (account S3 BPA, `h0-quorum-tfstate-260289091534` bucket, SNS
  topic + subscription, $20 budget, billing alarm) — gated on approval **and** billing
  verification; needs your alert email address.
