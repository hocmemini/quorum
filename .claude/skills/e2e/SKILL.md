---
name: e2e
description: Run a full end-to-end test pass against the live backend (migrate, seed, integration suite, warm-latency + failover benchmark). Use when the operator asks to run real or E2E tests or to validate the live system.
---

# End-to-end test pass

Run the full suite against the LIVE cluster (run `/golive` first).

## Guardrails

- Cluster must be up; `AWS_PROFILE=h0`.
- This writes test data; reset afterward with the `wipe` skill (`scripts/wipe-db.sh --seed`) to leave a clean demo.

## Run

1. `scripts/e2e.sh`: migrate, seed, the gated integration suite (dedupe, concurrent OCC, projection, ingestion smoke), then the warm-latency + failover benchmark.
2. Report results, especially the **warm write p50/p99** and the **failover time** (the demo-critical numbers, DEC-015). Connect cost is reported separately from commit cost.
3. Front end: exercise the deployed war room by hand, create an incident, add a note, resolve, and toggle the resilience panel to confirm live failover.

## Track

Record the run + the measured numbers in `docs/PROVENANCE.md`. Per DEC-015, no latency figure enters the submission write-up until it has been measured warm.
