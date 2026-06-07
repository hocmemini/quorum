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

## 2026-06-07 — Phase 1: Account audit (read-only)

Read-only; findings in [AUDIT.md](./AUDIT.md). Cost Explorer billed ~$0.01/call (2 calls).

_log continues as actions are taken…_
