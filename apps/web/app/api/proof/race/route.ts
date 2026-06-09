import { withOccRetry } from '@quorum/db';
import { getDb } from '@/lib/db';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// Fixed UUID for the single contended proof row (DEC-021): a dedicated, ephemeral target reset on
// every race, so the no-split-brain proof never pollutes the seeded incident list.
const RACE_ID = '00000000-0000-4000-8000-000000000001';

// Two writers, one truth. Launch two concurrent conflicting state transitions on the SAME row, one
// through each region pool, each conditioned on the version it read. DSQL's OCC serializes them to a
// single value; the loser's conditional UPDATE misses (or trips a real 40001) and the existing
// withOccRetry path re-reads and reconciles. Both regions then read back identical: no split-brain.
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

  // Reset the dedicated, ephemeral proof row (not an incident; not in any workspace list).
  await pA.query('DELETE FROM proof_race WHERE race_id = $1', [RACE_ID]);
  await pA.query(
    "INSERT INTO proof_race (race_id, version, status, region) VALUES ($1, 0, 'open', $2)",
    [RACE_ID, rA],
  );

  const transition = (
    pool: (typeof pools)[number],
    region: string,
    target: string,
    onRetry: () => void,
  ): Promise<void> =>
    withOccRetry(
      async () => {
        const cur = await pool.query('SELECT version FROM proof_race WHERE race_id = $1', [
          RACE_ID,
        ]);
        const v = Number(cur.rows[0]?.version ?? 0);
        const res = await pool.query(
          'UPDATE proof_race SET version = $1, status = $2, region = $3, updated_at = now() WHERE race_id = $4 AND version = $5',
          [v + 1, target, region, RACE_ID, v],
        );
        if ((res.rowCount ?? 0) === 0) {
          // Optimistic-lock miss: the other writer bumped the version. Surface as 40001 so the
          // existing OCC retry re-reads the current state and reconciles.
          const e = new Error('optimistic version conflict') as Error & { code?: string };
          e.code = '40001';
          throw e;
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

  // Strong consistency: read the settled row from BOTH regions and confirm they are identical.
  const [a, b] = await Promise.all([
    pA.query('SELECT version, status FROM proof_race WHERE race_id = $1', [RACE_ID]),
    pB.query('SELECT version, status FROM proof_race WHERE race_id = $1', [RACE_ID]),
  ]);
  const rowA = a.rows[0];
  const rowB = b.rows[0];
  const agree = !!rowA && !!rowB && rowA.version === rowB.version && rowA.status === rowB.status;
  const retries = aRetries + bRetries;

  return Response.json({
    conflicted: retries > 0,
    loserRegion: bRetries >= aRetries ? rB : rA,
    retries,
    finalStatus: rowA?.status ?? null,
    finalVersion: Number(rowA?.version ?? 0),
    agree,
    regionA: rA,
    regionB: rB,
  });
}
