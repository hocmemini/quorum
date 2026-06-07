import {
  addNote,
  assignAction,
  changeSeverity,
  changeStatus,
  createAction,
  type Database,
  type EventContext,
  getIncidentState,
  type IncidentState,
  type IncidentStatus,
  openIncident,
  resolveIncident,
} from '@quorum/db';
import type { Kysely } from 'kysely';

/**
 * Framework-agnostic service layer (WP-5). Each handler validates untrusted input then calls the
 * WP-4 domain over an injected, region-aware Kysely<Database>. WP-6 (Next.js route handlers) and
 * WP-7 (ingestion Lambda) are thin adapters over these. Handlers are async, so validation errors
 * surface as promise rejections (a consistent contract for callers).
 */

export class ValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ValidationError';
  }
}

function reqStr(v: unknown, field: string): string {
  if (typeof v !== 'string' || v.trim() === '') throw new ValidationError(`${field} is required`);
  return v;
}

function optStr(v: unknown, field: string): string | undefined {
  if (v === undefined || v === null) return undefined;
  if (typeof v !== 'string') throw new ValidationError(`${field} must be a string`);
  return v;
}

function reqStatus(v: unknown): IncidentStatus {
  if (v === 'open' || v === 'acknowledged' || v === 'resolved') return v;
  throw new ValidationError('status must be one of: open, acknowledged, resolved');
}

/** Shared request fields: emitting region, optional actor, optional idempotency key. */
interface BaseRequest {
  originRegion: unknown;
  actor?: unknown;
  eventId?: unknown;
}

function ctxFrom(req: BaseRequest): EventContext {
  const ctx: EventContext = { originRegion: reqStr(req.originRegion, 'originRegion') };
  const actor = optStr(req.actor, 'actor');
  if (actor !== undefined) ctx.actor = actor;
  const eventId = optStr(req.eventId, 'eventId');
  if (eventId !== undefined) ctx.eventId = eventId;
  return ctx;
}

export async function createIncident(
  db: Kysely<Database>,
  req: BaseRequest & {
    title: unknown;
    severity: unknown;
    signalId?: unknown;
    incidentId?: unknown;
  },
): Promise<{ incidentId: string; deduped: boolean }> {
  const title = reqStr(req.title, 'title');
  const severity = reqStr(req.severity, 'severity');
  const signalId = optStr(req.signalId, 'signalId');
  const incidentId = optStr(req.incidentId, 'incidentId');
  const ctx = ctxFrom(req);
  return openIncident(
    db,
    { title, severity, signalId: signalId ?? null, ...(incidentId ? { incidentId } : {}) },
    ctx,
  );
}

export async function appendNote(
  db: Kysely<Database>,
  req: BaseRequest & { incidentId: unknown; body: unknown },
): Promise<{ deduped: boolean }> {
  const incidentId = reqStr(req.incidentId, 'incidentId');
  const body = reqStr(req.body, 'body');
  return addNote(db, incidentId, body, ctxFrom(req));
}

export async function createIncidentAction(
  db: Kysely<Database>,
  req: BaseRequest & { incidentId: unknown; title: unknown; actionId?: unknown },
): Promise<{ actionId: string; deduped: boolean }> {
  const incidentId = reqStr(req.incidentId, 'incidentId');
  const title = reqStr(req.title, 'title');
  const actionId = optStr(req.actionId, 'actionId');
  return createAction(db, incidentId, { title, ...(actionId ? { actionId } : {}) }, ctxFrom(req));
}

export async function assignIncidentAction(
  db: Kysely<Database>,
  req: BaseRequest & { incidentId: unknown; actionId: unknown; assignee: unknown },
): Promise<{ deduped: boolean }> {
  const incidentId = reqStr(req.incidentId, 'incidentId');
  const actionId = reqStr(req.actionId, 'actionId');
  const assignee = reqStr(req.assignee, 'assignee');
  return assignAction(db, incidentId, actionId, assignee, ctxFrom(req));
}

export async function setStatus(
  db: Kysely<Database>,
  req: BaseRequest & { incidentId: unknown; status: unknown },
): Promise<{ deduped: boolean }> {
  const incidentId = reqStr(req.incidentId, 'incidentId');
  const status = reqStatus(req.status);
  return changeStatus(db, incidentId, status, ctxFrom(req));
}

export async function setSeverity(
  db: Kysely<Database>,
  req: BaseRequest & { incidentId: unknown; severity: unknown },
): Promise<{ deduped: boolean }> {
  const incidentId = reqStr(req.incidentId, 'incidentId');
  const severity = reqStr(req.severity, 'severity');
  return changeSeverity(db, incidentId, severity, ctxFrom(req));
}

export async function resolve(
  db: Kysely<Database>,
  req: BaseRequest & { incidentId: unknown; resolution?: unknown },
): Promise<{ deduped: boolean }> {
  const incidentId = reqStr(req.incidentId, 'incidentId');
  const resolution = optStr(req.resolution, 'resolution');
  return resolveIncident(db, incidentId, ctxFrom(req), resolution);
}

/** READ path, never OCC-wrapped. */
export async function readIncident(
  db: Kysely<Database>,
  incidentId: unknown,
): Promise<IncidentState> {
  return getIncidentState(db, reqStr(incidentId, 'incidentId'));
}
