import type { ColumnType, Generated, Insertable, Selectable } from 'kysely';

// jsonb: pg parses it to a JS object on read; on write we pass a JSON string (see WP-3 helpers).
type Jsonb = ColumnType<Record<string, unknown>, string, string>;

/** OSM-informed catalog of monitored services. */
export interface ServiceTable {
  service_id: string; // uuid, app-supplied (random v4 — write distribution)
  name: string;
  tier: string | null;
  metadata: Jsonb;
  created_at: Generated<Date>;
}

/** Catalog of signals/alarms that can open incidents. */
export interface SignalTable {
  signal_id: string; // uuid, app-supplied
  service_id: string; // app-layer ref -> service (no FK)
  name: string;
  source: string | null; // e.g. the CloudWatch alarm name
  severity: string | null;
  metadata: Jsonb;
  created_at: Generated<Date>;
}

/** Incident stream anchor; current state is projected from incident_event (DEC-004). */
export interface IncidentTable {
  incident_id: string; // uuid, app-supplied
  signal_id: string | null; // app-layer ref -> signal (null = manually opened)
  origin_region: string;
  created_at: Generated<Date>;
}

/**
 * Append-only event log. `event_id` is app-supplied and is both the primary key and the
 * idempotency key (DEC-005): a duplicate insert (SQLSTATE 23505) is treated as success.
 * Stream order is (created_at, event_id).
 */
export interface IncidentEventTable {
  event_id: string;
  incident_id: string; // app-layer ref -> incident (no FK)
  type: string; // documented vocabulary, not a CHECK constraint
  payload: Jsonb;
  actor: string | null;
  origin_region: string;
  created_at: Generated<Date>;
}

export interface Database {
  service: ServiceTable;
  signal: SignalTable;
  incident: IncidentTable;
  incident_event: IncidentEventTable;
}

export type Service = Selectable<ServiceTable>;
export type NewService = Insertable<ServiceTable>;
export type Signal = Selectable<SignalTable>;
export type NewSignal = Insertable<SignalTable>;
export type Incident = Selectable<IncidentTable>;
export type NewIncident = Insertable<IncidentTable>;
export type IncidentEvent = Selectable<IncidentEventTable>;
export type NewIncidentEvent = Insertable<IncidentEventTable>;

/** Known incident_event.type values (app-enforced; see IncidentEventTable.type). */
export const INCIDENT_EVENT_TYPES = [
  'incident.opened',
  'note.added',
  'action.created',
  'action.assigned',
  'status.changed',
  'severity.changed',
  'incident.resolved',
] as const;
export type IncidentEventType = (typeof INCIDENT_EVENT_TYPES)[number];
