import { randomUUID } from 'node:crypto';
import { getDb, survivorState } from '@/lib/db';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// Judge-triggered read-your-writes proof (DEC-018), now chaos-aware (DEC-023). Both regions up: write
// in one region, read it back from the other. A region failed for the session: survivor-only commit,
// durable via the us-west-2 witness quorum, with NO read from (or claim about) the down region.
export async function POST() {
  const db = getDb();
  const pools = db.pools();
  const regions = db.regions();
  const rA = regions[0];
  const rB = regions[1];
  const pA = pools[0];
  const pB = pools[1];
  if (!rA || !rB || !pA || !pB)
    return Response.json({ error: 'need two regions' }, { status: 503 });
  const { up, witness } = await survivorState();
  if (up.length === 0) return Response.json({ degraded: true });

  const round = (n: number) => Math.round(n * 10) / 10;
  const eventId = randomUUID();
  const marker = randomUUID();

  // Survivor-only during a simulated outage: commit to the one region still up; the witness keeps the
  // write durable in quorum. No transaction with the down region.
  if (up.length < regions.length) {
    const survivor = up[0];
    if (!survivor) return Response.json({ degraded: true });
    const pool = survivor === rA ? pA : pB;
    const t = performance.now();
    await pool.query(
      'INSERT INTO spike_event (event_id, origin_region, seq, payload) VALUES ($1, $2, $3, $4::jsonb)',
      [eventId, survivor, Date.now(), JSON.stringify({ proof: marker })],
    );
    return Response.json({
      survivorOnly: true,
      survivor,
      witness,
      commitMs: round(performance.now() - t),
    });
  }

  // Both regions up: write in region A, read it back from region B.
  const t0 = performance.now();
  await pA.query(
    'INSERT INTO spike_event (event_id, origin_region, seq, payload) VALUES ($1, $2, $3, $4::jsonb)',
    [eventId, rA, Date.now(), JSON.stringify({ proof: marker })],
  );
  const commitMs = performance.now() - t0;

  const tr = performance.now();
  const r = await pB.query<{ payload: { proof?: string } }>(
    'SELECT payload FROM spike_event WHERE event_id = $1',
    [eventId],
  );
  const readBackMs = performance.now() - tr;
  const crossRegionMs = performance.now() - t0;
  const confirmed = r.rows[0]?.payload?.proof === marker;

  return Response.json({
    commitMs: round(commitMs),
    crossRegionMs: round(crossRegionMs),
    readBackMs: round(readBackMs),
    confirmed,
    wroteRegion: rA,
    readRegion: rB,
  });
}
