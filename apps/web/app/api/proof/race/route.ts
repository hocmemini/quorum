import { randomUUID } from 'node:crypto';
import { withOccRetry } from '@quorum/db';
import { getDb, survivorState } from '@/lib/db';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// Dedicated demonstration incident (DEC-022): a fixed id under a non-workspace org so it never shows
// in any war-room list; reset on every race so repeated races stay clean. The race writes to its
// real append-only timeline, not an abstract row.
const DEMO_ID = '00000000-0000-4000-8000-0000000000d2';
const DEMO_ORG = '__race_demo__';

export async function POST() {
  const db = getDb();
  const pools = db.pools();
  const regions = db.regions();
  const pA = pools[0];
  const pB = pools[1];
  const rA = regions[0];
  const rB = regions[1];
  if (!pA || !pB || !rA || !rB)
    return Response.json({ error: 'need two regions' }, { status: 503 });

  // Chaos-aware (DEC-023): the two-region race needs both regions. If either is down for the session,
  // step aside with a resume-on-restore note rather than transact with a failed region.
  const { down, up } = await survivorState();
  if (down.length > 0) {
    return Response.json({
      steppedAside: true,
      downRegion: down[0] ?? null,
      survivor: up[0] ?? null,
    });
  }

  // Reset: clear the timeline and re-open the demonstration incident at version 0.
  await pA.query('DELETE FROM incident_event WHERE incident_id = $1', [DEMO_ID]);
  await pA.query('DELETE FROM incident WHERE incident_id = $1', [DEMO_ID]);
  await pA.query(
    'INSERT INTO incident (incident_id, signal_id, org_id, origin_region, version) VALUES ($1, NULL, $2, $3, 0)',
    [DEMO_ID, DEMO_ORG, rA],
  );
  await pA.query(
    "INSERT INTO incident_event (event_id, incident_id, type, payload, actor, origin_region) VALUES ($1, $2, 'incident.opened', $3::jsonb, 'system', $4)",
    [randomUUID(), DEMO_ID, JSON.stringify({ title: 'Split-brain race demonstration' }), rA],
  );

  // One version-guarded conditional transition, transactionally: append the status change AND bump the
  // incident version in one transaction. On the OCC conflict the whole transaction rolls back (the
  // loser's append is undone) and the existing withOccRetry path re-reads and reconciles. The
  // rolled-back event never appears in the committed timeline.
  const transition = (
    pool: (typeof pools)[number],
    region: string,
    target: string,
    onRetry: () => void,
  ): Promise<void> =>
    withOccRetry(
      async () => {
        const client = await pool.connect();
        try {
          await client.query('BEGIN');
          const cur = await client.query<{ version: number | null }>(
            'SELECT version FROM incident WHERE incident_id = $1',
            [DEMO_ID],
          );
          const v = Number(cur.rows[0]?.version ?? 0);
          await client.query(
            "INSERT INTO incident_event (event_id, incident_id, type, payload, actor, origin_region) VALUES ($1, $2, 'status.changed', $3::jsonb, $4, $5)",
            [randomUUID(), DEMO_ID, JSON.stringify({ status: target }), region, region],
          );
          const upd = await client.query(
            'UPDATE incident SET version = $1 WHERE incident_id = $2 AND version = $3',
            [v + 1, DEMO_ID, v],
          );
          if ((upd.rowCount ?? 0) === 0) {
            const e = new Error('optimistic version conflict') as Error & { code?: string };
            e.code = '40001';
            throw e;
          }
          await client.query('COMMIT');
        } catch (e) {
          await client.query('ROLLBACK').catch(() => {});
          throw e;
        } finally {
          client.release();
        }
      },
      { onRetry },
    );

  let aRetries = 0;
  let bRetries = 0;
  await Promise.all([
    transition(pA, rA, 'resolved', () => {
      aRetries++;
    }),
    transition(pB, rB, 'acknowledged', () => {
      bRetries++;
    }),
  ]);

  // Strong consistency: read the linearized timeline from BOTH regions; the committed sequence is
  // identical, and the rolled-back loser is absent.
  const readTimeline = (pool: (typeof pools)[number]) =>
    pool.query<{
      event_id: string;
      type: string;
      payload: { status?: string };
      actor: string | null;
    }>(
      'SELECT event_id, type, payload, actor FROM incident_event WHERE incident_id = $1 ORDER BY created_at, event_id',
      [DEMO_ID],
    );
  const [a, b] = await Promise.all([readTimeline(pA), readTimeline(pB)]);
  const digest = (rows: { event_id: string }[]) => rows.map((r) => r.event_id).join(',');
  const agree = digest(a.rows) === digest(b.rows);
  const timeline = a.rows.map((r) => ({
    type: r.type,
    status: r.payload?.status ?? null,
    actor: r.actor,
  }));
  const lastStatus =
    [...timeline].reverse().find((t) => t.type === 'status.changed')?.status ?? null;
  const retries = aRetries + bRetries;

  return Response.json({
    conflicted: retries > 0,
    loserRegion: bRetries >= aRetries ? rB : rA,
    retries,
    finalStatus: lastStatus,
    agree,
    count: a.rows.length,
    timeline,
    regionA: rA,
    regionB: rB,
  });
}
