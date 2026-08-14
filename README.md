# Quorum

Incident command plane on Aurora DSQL (multi-region). H0 hackathon.

> **Status: archived — live infrastructure torn down.** The hackathon is complete and the entire
> backend has been decommissioned: the Aurora DSQL clusters, both Lambdas, the monitor, the Vercel
> deployment, and all supporting AWS resources no longer exist, so the demo links are inactive and
> `pnpm` scripts that target live infra will not connect. This repository is preserved read-only as a
> record of the build. See [`docs/PROVENANCE.md`](docs/PROVENANCE.md) for the teardown log and
> [`docs/SOW.md`](docs/SOW.md) §11 for the full decision history (DEC-001…029).

## Prerequisites

- Node 22 LTS (see `.nvmrc`), repo currently validated on Node 24
- pnpm (`corepack enable`)
- Terraform >= 1.11
- AWS CLI v2 with profile `h0`

## AWS profile

Profile `h0` lives in `~/.aws/credentials`; `AWS_PROFILE=h0` is exported in your shell.
Verify:

```sh
aws sts get-caller-identity
```

## Workspace

```sh
pnpm install        # install all workspaces
pnpm check          # Biome lint + format (writes fixes)
pnpm lint           # Biome check (no writes)
pnpm typecheck      # tsc --noEmit across packages
pnpm test           # vitest run
```

## Git hooks

```sh
scripts/setup-hooks.sh   # enable the gitleaks pre-commit hook (run once per clone)
```

## Migrations

```sh
pnpm --filter @quorum/db migrate
```
