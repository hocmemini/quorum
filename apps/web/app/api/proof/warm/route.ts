import { randomUUID } from 'node:crypto';
import { getDb, survivorState } from '@/lib/db';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// Pre-warm the cross-region read-your-writes route (DEC-022), chaos-aware (DEC-023). Both regions up:
// write to one pool, read from the other. A region failed for the session: warm only the survivor.
// Never calls a region marked down. Run on war-room mount so the first measured click is warm.
export async function POST() {
  const db = getDb();
  const pools = db.pools();
  const regions = db.regions();
  const rA = regions[0];
  const rB = regions[1];
  const pA = pools[0];
  const pB = pools[1];
  if (!rA || !rB || !pA || !pB) return Response.json({ ok: false }, { status: 503 });
  const { up } = await survivorState();
  if (up.length === 0) return Response.json({ ok: false });

  const id = randomUUID();
  try {
    if (up.length < regions.length) {
      const survivor = up[0] ?? rA;
      const pool = survivor === rA ? pA : pB;
      await pool.query(
        "INSERT INTO spike_event (event_id, origin_region, seq, payload) VALUES ($1, $2, $3, '{}'::jsonb)",
        [id, survivor, Date.now()],
      );
      await pool.query('SELECT 1 FROM spike_event WHERE event_id = $1', [id]);
    } else {
      await pA.query(
        "INSERT INTO spike_event (event_id, origin_region, seq, payload) VALUES ($1, $2, $3, '{}'::jsonb)",
        [id, rA, Date.now()],
      );
      await pB.query('SELECT 1 FROM spike_event WHERE event_id = $1', [id]);
    }
  } catch {
    return Response.json({ ok: false });
  }
  return Response.json({ ok: true });
}
