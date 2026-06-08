---
name: teardown
description: Tear down the live Quorum backend (destroy the DSQL cluster and Lambdas), keeping the budget guardrail. Use when the operator asks to tear down, bring the stack down, or stop cost.
---

# Teardown

Destroy the app stacks; keep `infra/bootstrap` (the budget is permanent, CLAUDE.md).

## Guardrails

- DESTRUCTIVE: confirm with the operator first. This deletes the DSQL cluster and its data.
- Always `AWS_PROFILE=h0`.

## Run

1. `scripts/teardown.sh` (disables deletion protection, then destroys ingest, monitor, and app; keeps bootstrap).
2. Verify with `scripts/status.sh` (clusters should be gone, spend flat).
3. Append a dated `docs/PROVENANCE.md` entry (DEC-008 redaction).

Pass `all` only to also destroy bootstrap (rare; the bucket must hold no other stacks' state).
