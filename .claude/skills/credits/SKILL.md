---
name: credits
description: Snapshot AWS cost + promotional-credit consumption to budget the project and keep judging headroom. Use before and after a test run, or when the operator asks about credits, spend, or budget.
---

# Credits + cost check

Run `scripts/credits.sh` (read-only, `AWS_PROFILE=h0`). Reports project + current-month spend (Cost Explorer, with credits applied shown as a Credit record type), the top services, and the $20 budget actual vs limit.

## Notes

- Cost Explorer data lags ~24h; a new account may show none yet.
- The exact remaining promotional-credit **balance** is console-only (Billing and Cost Management -> Credits). Report spend + applied credits and point the operator there.
- Claiming the hackathon AWS + v0 credits is a console **form** (deadline 2026-06-26); CC cannot claim it.

## Cadence

Run before a big test pass and after, so cost is budgeted across the whole project rather than per run, and there is headroom through judging (2026-07-24). Note figures in `docs/PROVENANCE.md`.
