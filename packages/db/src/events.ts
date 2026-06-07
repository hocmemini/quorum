import type { Kysely } from 'kysely';
import { isUniqueViolation, withOccRetry } from './occ';
import type { Database, IncidentEvent, NewIncidentEvent } from './schema';

/**
 * Run an idempotent write under OCC retry: retried on serialization failure (40001); a
 * duplicate-key collision (23505) is treated as **success** (DEC-005). Returns whether the row
 * already existed. This is the reusable write primitive; query bindings live below.
 */
export async function idempotentWrite(insert: () => Promise<void>): Promise<{ deduped: boolean }> {
  return withOccRetry(async () => {
    try {
      await insert();
      return { deduped: false };
    } catch (e) {
      if (isUniqueViolation(e)) return { deduped: true };
      throw e;
    }
  });
}

/**
 * Append an event to the log. `event_id` is the idempotency key (DEC-005): duplicate delivery
 * collides on the primary key and is treated as success. WRITE path (OCC-wrapped).
 */
export async function appendEvent(
  db: Kysely<Database>,
  event: NewIncidentEvent,
): Promise<{ deduped: boolean }> {
  return idempotentWrite(async () => {
    await db.insertInto('incident_event').values(event).execute();
  });
}

/** Read an incident's event stream in order. READ path - never OCC-wrapped (CLAUDE.md). */
export function readIncidentEvents(
  db: Kysely<Database>,
  incidentId: string,
): Promise<IncidentEvent[]> {
  return db
    .selectFrom('incident_event')
    .selectAll()
    .where('incident_id', '=', incidentId)
    .orderBy('created_at')
    .orderBy('event_id')
    .execute();
}
