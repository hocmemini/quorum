# v0 prompt: Quorum war room

Paste the prompt below into [v0.app](https://v0.app) (sign in with the hackathon Vercel account;
this spends the $30 v0 credits). v0's defaults, Next.js App Router + Tailwind + shadcn/ui + dark
mode, are exactly the stack this repo is wired for, so the output drops in cleanly. Generate the
UI with mock data; CC wires it to the live API afterward (the data shapes and routes are in the
"Integration notes" section, which you do not need to paste).

Iterate in v0 until it looks sharp, then use "Add to Codebase" (the `shadcn add` command it gives
you) against `apps/web`, or share the export with CC.

---

## Prompt (paste this)

Build a polished, dark-themed incident command "war room" dashboard for a B2B SaaS product called
**Quorum**. The product's angle: the incident control plane runs on a multi-region, active-active
database (Aurora DSQL), so it keeps operating even when an entire cloud region fails. The UI should
feel like a serious operations tool, in the spirit of Linear, Datadog, and the Vercel dashboard:
dense but clean, fast, dark, with monospace accents for IDs and timestamps and restrained color.

Screens:

1. War room (home page):
   - A header with the product name "Quorum" on the left and, on the right, a live "serving region"
     badge (e.g. `us-east-1`) that turns amber and reads "failover active" when the system is
     degraded. Under the header, a one-line tagline: "Incident command plane on multi-region Aurora DSQL."
   - A prominent, slightly accented "Resilience demo" card: text explains "Simulate a region outage,
     this session fails over to a survivor; active-active means no data is lost." Below the text, a
     row of toggle buttons, one per region (`us-east-1`, `us-east-2`). Each reads "Simulate {region}
     outage" normally, and "{region}: DOWN (restore)" with a red border when active.
   - An inline "New incident" form: a text input ("New incident title"), a severity select
     (sev1 / sev2 / sev3), and an "Open incident" button.
   - An incidents table with columns: Incident (a linked title), Status (a badge: open / acknowledged
     / resolved), Severity (a badge colored sev1 red, sev2 amber, sev3 blue), Region, and Opened (a
     timestamp). Show a clean empty state: "No incidents yet. Open one above."

2. Incident detail page (route `/incidents/[id]`):
   - A back link to the war room, the incident title, and a metadata line: status badge, severity
     badge, opened and resolved timestamps, and the serving region.
   - An "Action items" section: a list of items, each a title with an optional assignee.
   - A "Timeline" section: an append-only feed of notes rendered as a vertical timeline, each entry
     with a timestamp, an actor name, and the note body.
   - An actions bar: an "Add a note" text input with a button, plus "Acknowledge", "Reopen", and
     "Resolve" buttons.

Style: dark background near `#0b0e14`; card panels near `#141925` with subtle borders near
`#232a3b`; light text; muted gray for secondary text; severity colors sev1 `#ff5c5c`, sev2
`#ffb020`, sev3 `#4aa3ff`; a calm blue accent (`#4aa3ff`) for links and active state. Use
shadcn/ui components (Card, Badge, Button, Table, Input, Select). Monospace for IDs and timestamps.
Fully responsive. No external images or logos.

Use realistic mock data: for example an "API gateway 5xx spike" sev2 incident, acknowledged, with a
couple of timeline notes ("Pager fired on elevated 5xx", "Investigating") and an action item "Shift
traffic to us-east-2" assigned to an on-call engineer. Keep components cleanly separated and named
so they are easy to wire to a real API: `ServingRegionBadge`, `ResiliencePanel`, `NewIncidentForm`,
`IncidentsTable`, `StatusBadge`, `SeverityBadge`, `IncidentDetail`, `Timeline`, `IncidentActions`.

---

## Integration notes (for CC, not for the prompt)

The backend already exists; v0 only needs to produce the visual layer. Wiring targets:

- **Data shapes** (`@quorum/api`): `IncidentSummary { incidentId, title, status, severity,
  originRegion, openedAt, lastEventAt }`; `IncidentState { status, title, severity, notes[{id, at,
  actor, body}], actions[{actionId, title, assignee}], openedAt, resolvedAt }`.
- **Reads** are server components calling `query(...)` from `apps/web/lib/db.ts`; the serving region
  and `regions`/`down` for the ResiliencePanel come from `chaosState()`.
- **Mutations** hit existing route handlers: `POST /api/incidents` (create), `POST
  /api/incidents/[id]/events` (`kind`: note | status | severity | action | assign | resolve), and
  `POST /api/chaos` (`downRegions: string[]`) for the resilience toggle.
- Keep the route handlers and `lib/db.ts` as-is; replace only the presentational components, mapping
  v0's mock props to these shapes.
