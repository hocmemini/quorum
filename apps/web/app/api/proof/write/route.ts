import { randomUUID } from 'node:crypto';
import { cookies } from 'next/headers';
import { CHAOS_COOKIE_NAME, getDb } from '@/lib/db';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// Judge-triggered proof (DEC-018): a real write in one region, confirmed by reading it back from
// the other region through the failover pools. Numbers are measured per request and never cached,
// so they jitter naturally. Honors the chaos cookie: if a region is marked down, write to the
// survivor and confirm from the other.
export async function POST() {
  const db = getDb();
  const pools = db.pools();
  const regions = db.regions();
  if (regions.length < 2 || !pools[0] || !pools[1] || !regions[0] || !regions[1]) {
    return Response.json({ error: 'need two regions' }, { status: 503 });
  }
  const down = new Set(
    ((await cookies()).get(CHAOS_COOKIE_NAME)?.value ?? '')
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean),
  );
  const writeIdx = down.has(regions[0]) ? 1 : 0;
  const readIdx = writeIdx === 0 ? 1 : 0;
  const writePool = pools[writeIdx];
  const readPool = pools[readIdx];
  if (!writePool || !readPool) return Response.json({ error: 'pool missing' }, { status: 503 });

  const eventId = randomUUID();
  const marker = randomUUID();

  // 1. real write (event_id is the PK + idempotency key); measure the local commit.
  const t0 = performance.now();
  await writePool.query(
    'INSERT INTO spike_event (event_id, origin_region, seq, payload) VALUES ($1, $2, $3, $4::jsonb)',
    [eventId, regions[writeIdx], Date.now(), JSON.stringify({ proof: marker })],
  );
  const commitMs = performance.now() - t0;

  // 2. read it back from the OTHER region; confirm identical; measure cross-region visibility.
  const tr = performance.now();
  const r = await readPool.query<{ payload: { proof?: string } }>(
    'SELECT payload FROM spike_event WHERE event_id = $1',
    [eventId],
  );
  const readBackMs = performance.now() - tr;
  const crossRegionMs = performance.now() - t0;
  const confirmed = r.rows[0]?.payload?.proof === marker;

  const r1 = (n: number) => Math.round(n * 10) / 10;
  return Response.json({
    commitMs: r1(commitMs),
    crossRegionMs: r1(crossRegionMs),
    readBackMs: r1(readBackMs),
    confirmed,
    wroteRegion: regions[writeIdx],
    readRegion: regions[readIdx],
  });
}
