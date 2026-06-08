import { type Database, getIncidentState, type IncidentStatus } from '@quorum/db';
import type { Kysely } from 'kysely';

export interface IncidentSummary {
  incidentId: string;
  title: string | null;
  status: IncidentStatus;
  severity: string | null;
  originRegion: string;
  openedAt: Date | null;
  lastEventAt: Date | null;
}

/**
 * Recent incidents with their projected state for the war-room list. Projects each incident from
 * its event log (DEC-004); fine at demo scale, revisit with a read model if the list grows.
 * READ path, never OCC-wrapped.
 */
export async function listIncidents(
  db: Kysely<Database>,
  opts: { limit?: number } = {},
): Promise<IncidentSummary[]> {
  const limit = Math.min(Math.max(opts.limit ?? 50, 1), 200);
  const rows = await db
    .selectFrom('incident')
    .select(['incident_id', 'origin_region', 'created_at'])
    .orderBy('created_at', 'desc')
    .limit(limit)
    .execute();
  return Promise.all(
    rows.map(async (r) => {
      const state = await getIncidentState(db, r.incident_id);
      return {
        incidentId: r.incident_id,
        title: state.title,
        status: state.status,
        severity: state.severity,
        originRegion: r.origin_region,
        openedAt: state.openedAt,
        lastEventAt: state.lastEventAt,
      };
    }),
  );
}
