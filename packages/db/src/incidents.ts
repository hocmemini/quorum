import { randomUUID } from 'node:crypto';
import type { Kysely } from 'kysely';
import { appendEvent, idempotentWrite, readIncidentEvents } from './events';
import type { Database, IncidentEvent, IncidentEventType, NewIncidentEvent } from './schema';

export type IncidentStatus = 'open' | 'acknowledged' | 'resolved';

export interface IncidentNote {
  at: Date;
  actor: string | null;
  body: string;
}

export interface IncidentAction {
  actionId: string;
  title: string;
  assignee: string | null;
  createdAt: Date;
}

export interface IncidentState {
  incidentId: string;
  status: IncidentStatus;
  title: string | null;
  severity: string | null;
  notes: IncidentNote[];
  actions: IncidentAction[];
  openedAt: Date | null;
  resolvedAt: Date | null;
  lastEventAt: Date | null;
}

/** Per-event context: emitting region, actor, and an optional idempotency key (`event_id`). */
export interface EventContext {
  originRegion: string;
  actor?: string | null;
  eventId?: string;
}

type WriteResult = { deduped: boolean };

function buildEvent(
  incidentId: string,
  type: IncidentEventType,
  payload: Record<string, unknown>,
  ctx: EventContext,
): NewIncidentEvent {
  return {
    event_id: ctx.eventId ?? randomUUID(),
    incident_id: incidentId,
    type,
    payload: JSON.stringify(payload),
    actor: ctx.actor ?? null,
    origin_region: ctx.originRegion,
  };
}

// ---- Command (write) API: each appends one event; writes are OCC-wrapped + idempotent. ----

/** Open an incident: create the anchor row (idempotent) and append `incident.opened`. */
export async function openIncident(
  db: Kysely<Database>,
  args: { incidentId?: string; signalId?: string | null; title: string; severity: string },
  ctx: EventContext,
): Promise<{ incidentId: string } & WriteResult> {
  const incidentId = args.incidentId ?? randomUUID();
  await idempotentWrite(async () => {
    await db
      .insertInto('incident')
      .values({
        incident_id: incidentId,
        signal_id: args.signalId ?? null,
        origin_region: ctx.originRegion,
      })
      .execute();
  });
  const r = await appendEvent(
    db,
    buildEvent(incidentId, 'incident.opened', { title: args.title, severity: args.severity }, ctx),
  );
  return { incidentId, deduped: r.deduped };
}

export function addNote(
  db: Kysely<Database>,
  incidentId: string,
  body: string,
  ctx: EventContext,
): Promise<WriteResult> {
  return appendEvent(db, buildEvent(incidentId, 'note.added', { body }, ctx));
}

export async function createAction(
  db: Kysely<Database>,
  incidentId: string,
  action: { actionId?: string; title: string },
  ctx: EventContext,
): Promise<{ actionId: string } & WriteResult> {
  const actionId = action.actionId ?? randomUUID();
  const r = await appendEvent(
    db,
    buildEvent(incidentId, 'action.created', { actionId, title: action.title }, ctx),
  );
  return { actionId, deduped: r.deduped };
}

export function assignAction(
  db: Kysely<Database>,
  incidentId: string,
  actionId: string,
  assignee: string,
  ctx: EventContext,
): Promise<WriteResult> {
  return appendEvent(db, buildEvent(incidentId, 'action.assigned', { actionId, assignee }, ctx));
}

export function changeStatus(
  db: Kysely<Database>,
  incidentId: string,
  status: IncidentStatus,
  ctx: EventContext,
): Promise<WriteResult> {
  return appendEvent(db, buildEvent(incidentId, 'status.changed', { status }, ctx));
}

export function changeSeverity(
  db: Kysely<Database>,
  incidentId: string,
  severity: string,
  ctx: EventContext,
): Promise<WriteResult> {
  return appendEvent(db, buildEvent(incidentId, 'severity.changed', { severity }, ctx));
}

export function resolveIncident(
  db: Kysely<Database>,
  incidentId: string,
  ctx: EventContext,
  resolution?: string,
): Promise<WriteResult> {
  const payload = resolution === undefined ? {} : { resolution };
  return appendEvent(db, buildEvent(incidentId, 'incident.resolved', payload, ctx));
}

// ---- Projection (read): fold the ordered event log into current state (DEC-004). ----

function asString(v: unknown): string | null {
  return typeof v === 'string' ? v : null;
}

function asStatus(v: unknown): IncidentStatus | null {
  return v === 'open' || v === 'acknowledged' || v === 'resolved' ? v : null;
}

/** Pure projection: replay events (in order) to derive current incident state. */
export function projectIncident(
  incidentId: string,
  events: readonly IncidentEvent[],
): IncidentState {
  const state: IncidentState = {
    incidentId,
    status: 'open',
    title: null,
    severity: null,
    notes: [],
    actions: [],
    openedAt: null,
    resolvedAt: null,
    lastEventAt: null,
  };
  for (const e of events) {
    state.lastEventAt = e.created_at;
    const p = e.payload;
    switch (e.type) {
      case 'incident.opened':
        state.openedAt = e.created_at;
        state.title = asString(p.title);
        state.severity = asString(p.severity);
        state.status = 'open';
        break;
      case 'note.added':
        state.notes.push({ at: e.created_at, actor: e.actor, body: asString(p.body) ?? '' });
        break;
      case 'action.created':
        state.actions.push({
          actionId: asString(p.actionId) ?? '',
          title: asString(p.title) ?? '',
          assignee: null,
          createdAt: e.created_at,
        });
        break;
      case 'action.assigned': {
        const id = asString(p.actionId);
        const action = state.actions.find((a) => a.actionId === id);
        if (action) action.assignee = asString(p.assignee);
        break;
      }
      case 'status.changed':
        state.status = asStatus(p.status) ?? state.status;
        break;
      case 'severity.changed':
        state.severity = asString(p.severity);
        break;
      case 'incident.resolved':
        state.status = 'resolved';
        state.resolvedAt = e.created_at;
        break;
      default:
        break;
    }
  }
  return state;
}

/** Read an incident's event stream and project current state. READ path (no OCC). */
export async function getIncidentState(
  db: Kysely<Database>,
  incidentId: string,
): Promise<IncidentState> {
  return projectIncident(incidentId, await readIncidentEvents(db, incidentId));
}
