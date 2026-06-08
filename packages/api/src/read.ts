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
  opts: { limit?: number; orgId?: string } = {},
): Promise<IncidentSummary[]> {
  const limit = Math.min(Math.max(opts.limit ?? 50, 1), 200);
  let builder = db
    .selectFrom('incident')
    .select(['incident_id', 'origin_region', 'created_at'])
    .orderBy('created_at', 'desc')
    .limit(limit);
  if (opts.orgId) builder = builder.where('org_id', '=', opts.orgId);
  const rows = await builder.execute();
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

/** Workspace-scoped counters for the metrics panel. READ path. */
export async function workspaceMetrics(
  db: Kysely<Database>,
  orgId: string,
): Promise<{ events: number; services: number; signals: number }> {
  const [events, services, signals] = await Promise.all([
    db
      .selectFrom('incident_event')
      .innerJoin('incident', 'incident.incident_id', 'incident_event.incident_id')
      .where('incident.org_id', '=', orgId)
      .select((eb) => eb.fn.countAll().as('n'))
      .executeTakeFirst(),
    db
      .selectFrom('service')
      .select((eb) => eb.fn.countAll().as('n'))
      .executeTakeFirst(),
    db
      .selectFrom('signal')
      .select((eb) => eb.fn.countAll().as('n'))
      .executeTakeFirst(),
  ]);
  return {
    events: Number(events?.n ?? 0),
    services: Number(services?.n ?? 0),
    signals: Number(signals?.n ?? 0),
  };
}

export interface ActivityItem {
  eventId: string;
  type: string;
  actor: string | null;
  at: Date;
  incidentId: string;
}

/** Recent events across the workspace, for the live activity feed. READ path. */
export async function recentActivity(
  db: Kysely<Database>,
  orgId: string,
  limit = 8,
): Promise<ActivityItem[]> {
  const rows = await db
    .selectFrom('incident_event')
    .innerJoin('incident', 'incident.incident_id', 'incident_event.incident_id')
    .where('incident.org_id', '=', orgId)
    .select([
      'incident_event.event_id as eventId',
      'incident_event.type as type',
      'incident_event.actor as actor',
      'incident_event.created_at as at',
      'incident_event.incident_id as incidentId',
    ])
    .orderBy('incident_event.created_at', 'desc')
    .orderBy('incident_event.event_id', 'desc')
    .limit(Math.min(Math.max(limit, 1), 50))
    .execute();
  return rows.map((r) => ({
    eventId: r.eventId,
    type: r.type,
    actor: r.actor,
    at: r.at as Date,
    incidentId: r.incidentId,
  }));
}
