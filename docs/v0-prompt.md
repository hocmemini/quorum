# v0 prompt: Quorum (war room + Reliability surface)

Paste the prompt below into [v0.app](https://v0.app) (sign in with the hackathon Vercel account;
this spends the v0 credits). v0's defaults, Next.js App Router + Tailwind + shadcn/ui + dark mode,
match this repo. Generate with mock data; the engineer ports the design system afterward.

**Adoption rule (DEC-024 Part B).** Purely presentational leaf components (badges, tables, cards,
layout shells, the status band, tiles, checklists) may be adopted from v0 wholesale. Stateful proof
components (ProbeRunner, RaceVisual, BurstRunner, DrillControls) keep their existing logic and
receive **styling only**. No API route, data-flow, or claim-copy change anywhere.

---

## Prompt (paste this)

Build a polished, **dark "ops-terminal"** UI for a B2B SaaS product called **Quorum**, an incident
command plane whose control plane runs on a multi-region, active-active database (Aurora DSQL) and
keeps operating when an entire cloud region fails. The feel: a serious operations tool in the spirit
of Linear, Datadog, and the Vercel dashboard, dense but calm, fast, dark, monospace for all data
values (IDs, timestamps, latencies, region names), restrained color. No light mode, no generic-SaaS
gradients, no external images or logos. Fully responsive / mobile-passable.

There are **two product surfaces inside a workspace**, with a shared header (product name "Quorum"
on the left, a small nav with "War room" and "Reliability", and on the right a workspace name + a
copyable join code):

### Surface 1, War room (the calm product surface)

- A compact **control-plane status band**: a health dot (green serving / amber failover-active / red
  no-serving-region), the serving region (e.g. `us-east-1`), a "consistency 36 ms" chip with a
  green dot, the witness region, and a right-aligned "Run a failover drill" button linking to the
  Reliability surface.
- A **Get-started checklist** (3 steps, product tone) whose first step points at the Reliability
  surface.
- An inline **New incident** form (title input, severity select sev1/sev2/sev3, "Open incident").
- An **incidents table**: Incident (linked title), Status badge (open / acknowledged / resolved),
  Severity badge (sev1 red, sev2 amber, sev3 blue), Origin region, Opened timestamp; a clean empty
  state. A footer line defining "signal".

### Surface 2, Reliability (the verification apparatus, under product language)

A single column of cards, each a section with a product header ("Live verification", "Consistency
under contention", "Failover drills", "Usage"):

- **ArchitectureDiagram**: two full regions (`us-east-1`, `us-east-2`) side by side with a
  bidirectional sync arrow between them, and the `us-west-2` **witness** below, distinct. The
  serving region is highlighted green; a region in a drill shows amber "drill active"; a downed
  region dims red. Replication arrows animate subtly.
- **RegionTiles**: one tile per region showing state (serving green / standby neutral / down red)
  plus a live read latency, and a witness tile (blue, "durability quorum, non-serving").
- **HeroTiles**: two large tiles, "write commit (local region)" and "read-your-writes across
  regions", each a big monospace millisecond value with a small label; the second gets a green dot
  when confirmed identical.
- **ProbeRunner** (run-a-write): an accent button "Run a cross-region write" with a co-located
  result line ("committed in us-east-1 in 35 ms, read back identical from us-east-2 in 14 ms").
- **RaceVisual** (no-split-brain): a headline "Two writers, one truth, no split-brain", a "Race two
  writers" button, then two region boxes that each show an attempted value, the loser flashes a red
  conflict, both snap to a single agreed value with a green "no fork" check; a small secondary
  mechanism line; and a "committed timeline" list (the demonstration incident's linearized history).
- **BurstRunner**: a "Burst: 50 concurrent" button with a co-located result line ("50/50 committed,
  0 conflicts, 36..486 ms spread; both regions read 50 & 50, one consistent log").
- **DrillControls**: one button per region, "Run failover drill: us-east-1" normally and "End drill,
  restore us-east-1" in an **amber drill-active** state, with a measured failover line ("failed over
  to us-east-2 in 30 ms"). A note explains a drill opens an incident in the war room to coordinate.
- **UsageMeter**: one line, "usage: $0.00 this month, 1.1K of 100K free DPU, scale-to-zero".
- A muted **deferral footer**: "Deep per-service metrics live in your Grafana or Datadog. Quorum is
  the coordination plane that outlives the region they run in."

### Incident detail (route `/incidents/[id]`)

Back link, title, metadata line (status + severity badges, opened/resolved timestamps, serving
region), an opening-signal + affected-service line, an Action items list, an append-only Timeline,
and an actions bar (Add a note, Acknowledge, Reopen, Resolve).

### Palette, every chaos state has a styled appearance

Background near `#0b0e14`; panels `#141925`; borders `#232a3b`; light text; muted `#8a93a6`. Semantic
states: **serving/healthy green `#3fb950`**, **down red `#ff5c5c`**, **drill-active amber
`#ffb020`**, and a **witness blue distinct from links** (use a cyan/teal such as `#2dd4bf` for the
witness, keep `#4aa3ff` for links/active). Severity: sev1 red, sev2 amber, sev3 blue. Use shadcn/ui
(Card, Badge, Button, Table, Input, Select). Monospace for all data values.

Name components so they map to the existing app: `WorkspaceHeader`, `StatusBand`, `GetStarted`,
`NewIncidentForm`, `IncidentsTable`, `StatusBadge`, `SeverityBadge`, `ArchitectureDiagram`,
`RegionTiles`, `HeroTiles`, `ProbeRunner`, `RaceVisual`, `BurstRunner`, `DrillControls`,
`UsageMeter`, `IncidentDetail`, `Timeline`, `IncidentActions`.

---

## Integration notes (for the engineer, not for the prompt)

- **Surfaces**: war room is `apps/web/app/page.tsx`; Reliability is `apps/web/app/reliability/page.tsx`
  (renders `ControlPlanePanel`); incident detail is `apps/web/app/incidents/[id]/page.tsx`.
- **Stateful, styling-only**: `ProofControls` (ProbeRunner + BurstRunner + HeroTiles), `RaceVisual`,
  `ChaosPanel` (DrillControls), `ArchDiagram`. Keep their logic; restyle the markup.
- **Reads** are server components calling `query(...)` from `apps/web/lib/db.ts`; serving/down/witness
  come from `chaosState()`, per-region health from `regionHealth()`, the snapshot from
  `latestMonitorSnapshot()`. **Do not change** any `/api/*` route, claim text, or measured number.
- **Palette tokens** live in `apps/web/app/globals.css` as CSS vars exposed to Tailwind
  (`bg-bg`, `border-line`, `text-ok`, `text-sev1`, `text-sev2`, `text-accent`, `text-witness`).
