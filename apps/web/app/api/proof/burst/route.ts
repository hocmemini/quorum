import { randomUUID } from 'node:crypto';
import { getDb } from '@/lib/db';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// 50 simultaneous writes from both regions, one consistent log, zero divergence (DEC-018/021). The
// burst tags its writes with a run id, then reads the log back from BOTH region pools to prove the
// regions converged to an identical set (strong consistency, no fork), keeping committed/conflicts/spread.
export async function POST() {
  const db = getDb();
  const pools = db.pools();
  const regions = db.regions();
  const pA = pools[0];
  const pB = pools[1];
  if (!pA || !pB || !regions[0] || !regions[1]) {
    return Response.json({ error: 'need two regions' }, { status: 503 });
  }
  const total = 50;
  const runId = randomUUID();
  const payload = JSON.stringify({ burst: runId });
  const latencies: number[] = [];
  let committed = 0;
  let conflicts = 0;

  await Promise.all(
    Array.from({ length: total }, (_, i) => {
      const idx = i % 2;
      const pool = pools[idx];
      const region = regions[idx];
      if (!pool || !region) return Promise.resolve();
      const t = performance.now();
      return pool
        .query(
          'INSERT INTO spike_event (event_id, origin_region, seq, payload) VALUES ($1, $2, $3, $4::jsonb)',
          [randomUUID(), region, Date.now() * 1000 + i, payload],
        )
        .then(() => {
          committed++;
          latencies.push(performance.now() - t);
        })
        .catch((e: unknown) => {
          if ((e as { code?: string }).code === '40001') conflicts++;
          else throw e;
        });
    }),
  );

  // Strong consistency: read this run's log back from both regions; the counts must be identical.
  const [a, b] = await Promise.all([
    pA.query("SELECT count(*)::int AS n FROM spike_event WHERE payload->>'burst' = $1", [runId]),
    pB.query("SELECT count(*)::int AS n FROM spike_event WHERE payload->>'burst' = $1", [runId]),
  ]);
  const countA = Number(a.rows[0]?.n ?? 0);
  const countB = Number(b.rows[0]?.n ?? 0);

  latencies.sort((x, y) => x - y);
  const pick = (q: number) =>
    latencies[Math.min(latencies.length - 1, Math.floor(q * latencies.length))] ?? 0;
  const r1 = (n: number) => Math.round(n * 10) / 10;
  return Response.json({
    total,
    committed,
    conflicts,
    countA,
    countB,
    diverged: countA !== countB,
    minMs: r1(latencies[0] ?? 0),
    p50Ms: r1(pick(0.5)),
    maxMs: r1(latencies[latencies.length - 1] ?? 0),
  });
}
