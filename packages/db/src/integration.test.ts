import type { Kysely } from 'kysely';
import type { Pool } from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createDb } from './client';
import { appendEvent, readIncidentEvents } from './events';
import { deterministicId } from './ids';
import { getIncidentState, openIncident } from './incidents';
import { migrate } from './migrate';
import type { Database } from './schema';

// Live integration suite (WP-11). Gated on a real DSQL endpoint, so the default unit run skips it
// and it executes at go-live: DSQL_ENDPOINT_PRIMARY=<host> DSQL_REGION=<region> AWS_PROFILE=h0 pnpm test
const HOST = process.env.DSQL_ENDPOINT_PRIMARY ?? '';
const REGION = process.env.DSQL_REGION ?? 'us-east-1';
const MIGRATIONS = new URL('../migrations', import.meta.url).pathname;

describe.skipIf(!HOST)('integration (live DSQL)', () => {
  let db: Kysely<Database>;
  let pool: Pool;

  beforeAll(async () => {
    const created = createDb<Database>({ host: HOST, region: REGION });
    db = created.db;
    pool = created.pool;
    await migrate(MIGRATIONS);
  }, 90_000);

  afterAll(async () => {
    await pool?.end();
  });

  it('dedupes a duplicate event_id (idempotency, DEC-005)', async () => {
    const incidentId = deterministicId(`it-dup:${Date.now()}`);
    const event = {
      event_id: deterministicId(`it-dup-evt:${incidentId}`),
      incident_id: incidentId,
      type: 'note.added',
      payload: JSON.stringify({ body: 'duplicate' }),
      actor: 'test',
      origin_region: REGION,
    };
    const first = await appendEvent(db, event);
    const second = await appendEvent(db, event);
    expect(first.deduped).toBe(false);
    expect(second.deduped).toBe(true);
    const events = await readIncidentEvents(db, incidentId);
    expect(events).toHaveLength(1);
  }, 30_000);

  it('persists concurrent writes, retrying any serialization conflict (OCC)', async () => {
    const incidentId = deterministicId(`it-occ:${Date.now()}`);
    const count = 20;
    await Promise.all(
      Array.from({ length: count }, (_, i) =>
        appendEvent(db, {
          event_id: deterministicId(`it-occ:${incidentId}:${i}`),
          incident_id: incidentId,
          type: 'note.added',
          payload: JSON.stringify({ body: `n${i}` }),
          actor: 'test',
          origin_region: REGION,
        }),
      ),
    );
    const events = await readIncidentEvents(db, incidentId);
    expect(events).toHaveLength(count);
  }, 60_000);

  it('opens an incident and projects its state', async () => {
    const incidentId = deterministicId(`it-open:${Date.now()}`);
    await openIncident(
      db,
      { incidentId, title: 'integration', severity: 'sev2' },
      {
        originRegion: REGION,
        actor: 'test',
        eventId: deterministicId(`it-open-evt:${incidentId}`),
      },
    );
    const state = await getIncidentState(db, incidentId);
    expect(state.title).toBe('integration');
    expect(state.status).toBe('open');
  }, 30_000);
});
