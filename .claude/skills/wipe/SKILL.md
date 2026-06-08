---
name: wipe
description: Wipe the live DSQL app + probe tables to control storage cost during testing, optionally re-seeding a clean demo. Use when the operator asks to wipe, reset, or clear the database between test runs.
---

# Wipe the database

DESTRUCTIVE: deletes all incidents, events, catalog, and probe rows from the live cluster (active-active, so both regions clear). Confirm with the operator first.

## Guardrails

- Confirm before running; it is irreversible.
- `AWS_PROFILE=h0`; the cluster must be live.

## Run

- Wipe only: `scripts/wipe-db.sh`.
- Wipe then re-seed a clean demo (catalog + one demo incident, so "a few real ones" remain for judging): `scripts/wipe-db.sh --seed`.
- Verify with `/status` or the war room (the list should be empty, or just the seed).

DSQL has no `TRUNCATE`, so the wipe batch-DELETEs under the 3000-rows-per-transaction limit.

## Track

Note the wipe in `docs/PROVENANCE.md` (timestamp + what was reset).
