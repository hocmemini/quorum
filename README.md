# Quorum

Incident command plane on Aurora DSQL (multi-region). H0 hackathon.

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
