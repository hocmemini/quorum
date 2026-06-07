# Editorial and Hygiene Pass

**Mode:** pre-submission. **Date:** 2026-06-07. **Owner:** CC (approvals: JP).
**Result: PASS** (2 minor items for your review, none blocking).

Reusable WP-12 pass. Re-run before the 2026-06-29 submission as the Phase 5 gate, and again in
MODE=public-flip after judging (which adds the full git-history redaction review, an MIT LICENSE,
and a public README draft).

## Tool versions

- node 24.14.0, pnpm 11.5.2, Terraform 1.15.5, gitleaks 8.30.1
- Biome 2.4.16, TypeScript 6.0.3, Vitest 4.1.8
- markdownlint-cli2 0.22.1, knip 6.16.1, cspell 10.0.1
- Substitution: `cspell` for spelling (the `typos` tool has no first-class npm package);
  markdownlint-cli2 and knip per the prompt.

## Findings

| # | Section | Area | Issue | Severity | Action |
|---|---------|------|-------|----------|--------|
| 1 | 1 | 22 code/config/TF files | non-ASCII (em-dashes, arrows, mid-dots) in strict-ASCII files | low | fixed: folded to ASCII |
| 2 | 1 | repo | invisibles, bidi controls, math-alphanumerics | info | none found |
| 3 | 1/4 | all tracked markdown | em-dashes in prose | low | fixed: voice pass replaced with commas |
| 4 | 2 | docs/PROVENANCE.md | local OS username in a `/mnt/c/Users/...` path | medium | fixed: redacted to `<user>` (public GitHub handle kept) |
| 5 | 2 | working tree | account ID, IAM names, alert email, DSQL endpoints, Vercel IDs outside docs/private | info | none present (only #4) |
| 6 | 2 | git tracking | docs/private, .vercel, `*.tfstate*`, `.env*`, key material | info | none tracked (verified) |
| 7 | 2 | full history | gitleaks scan | info | 29 commits, no leaks |
| 8 | 2 | .env.example | `DSQL_ENDPOINT_WITNESS` (a witness region has no endpoint) | low | fixed: removed |
| 9 | 2 | .env.example vs code | `MONITOR_EVENTS` (Lambda env, Terraform-set); `AWS_ACCOUNT_ID`, `DSQL_PORT`, `DSQL_ENDPOINT_SECONDARY` placeholders | low | deferred: reconcile at WP-6/7 wiring |
| 10 | 3 | repo | TODO/FIXME/XXX/HACK | info | none |
| 11 | 3 | migrate, report, failover-smoke | console.log in src | info | intentional CLI/report/Lambda output, not debug leftovers; kept |
| 12 | 3 | package.json | knip flagged cspell, markdownlint-cli2 as unused devDeps | low | fixed: added lint:md / lint:spell / lint:deps scripts |
| 13 | 3 | repo | knip dead files/exports | info | none |
| 14 | 3 | all 6 workspace packages | `"private": true` | info | present on all (verified) |
| 15 | 3 | infra/spike, app, monitor | terraform fmt -check + validate | info | clean |
| 16 | 3 | scripts/, .githooks | exec bits | info | correct |
| 17 | 4 | docs + code | cspell spelling | info | no genuine typos; domain terms added to cspell.json |
| 18 | 4 | all markdown | markdownlint | low | auto-fixed; MD060 (table-pipe style) disabled as cosmetic; 0 errors |
| 19 | 4 | README, CLAUDE, SOW | "Aurora DSQL" first-use, region trio, YYYY-MM-DD dates | info | consistent (spot-checked) |
| 20 | 4 | docs/SOW.md WP-12 | banned word "additionally" in the provided WP-12 text | low | approval-needed: left verbatim |
| 21 | 4 | tracked public docs | Mermaid sources | info | none yet (architecture diagram is a later deliverable) |
| 22 | 4 | tracked public docs | links | info | internal links resolve; no http(s) external links present |
| 23 | 5 | fresh clone | install/build/test from scratch | info | PASS (transcript below) |

## Fresh-clone transcript (Section 5)

In a clean `git clone` of HEAD to a temp directory, following README setup:

```text
git clone <repo> /tmp/quorum-clone
pnpm install                                  # rc 0
pnpm check                                     # rc 0 (Biome, no fixes)
pnpm typecheck                                 # rc 0 (all packages)
pnpm test                                      # rc 0 (7 files, 27 tests)
pnpm lint:md / lint:spell / lint:deps          # rc 0 / 0 / 0
pnpm --filter @quorum/dsql-monitor build       # rc 0 (dist/index.js, ~1.4 MB)
```

No drift between the README setup steps and reality.

## Approval-needed (non-blocking)

1. **"additionally" in the WP-12 WBS text** (docs/SOW.md): your paste-ready text contains a
   word the voice list bans. Swap to "also"? Left verbatim pending your call.
2. **.env.example reconciliation** (defer to WP-6/7): `MONITOR_EVENTS` is a Lambda (Terraform)
   env, not a local `.env` var; `AWS_ACCOUNT_ID`, `DSQL_PORT`, `DSQL_ENDPOINT_SECONDARY` are
   forward-looking placeholders. Prune or wire them when the app/runtime lands.

## public-flip mode (not run now)

Section 6 runs after judging: full git-history identifier scan (the DEC-008 redaction-review
input), an MIT LICENSE under your confirmed name, and the expanded public README. It re-runs
sections 1 through 5.

## Result: PASS

No blocking findings. Mechanical fixes applied and committed (`chore(editorial): pre-submission
hygiene pass`). The two items above await your input.
