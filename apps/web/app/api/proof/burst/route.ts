import { randomUUID } from 'node:crypto';
import { getDb } from '@/lib/db';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// Concurrent-write burst (DEC-018 P2): fire N real writes across both regions at once through the
// failover pools, then report all committed, conflicts (SQLSTATE 40001), and the latency spread.
export async function POST() {
  const db = getDb();
  const pools = db.pools();
  const regions = db.regions();
  if (!pools[0] || !pools[1] || !regions[0] || !regions[1]) {
    return Response.json({ error: 'need two regions' }, { status: 503 });
  }
  const total = 50;
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
          "INSERT INTO spike_event (event_id, origin_region, seq, payload) VALUES ($1, $2, $3, '{}'::jsonb)",
          [randomUUID(), region, Date.now() * 1000 + i],
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

  latencies.sort((a, b) => a - b);
  const pick = (q: number) =>
    latencies[Math.min(latencies.length - 1, Math.floor(q * latencies.length))] ?? 0;
  const r1 = (n: number) => Math.round(n * 10) / 10;
  return Response.json({
    total,
    committed,
    conflicts,
    minMs: r1(latencies[0] ?? 0),
    p50Ms: r1(pick(0.5)),
    maxMs: r1(latencies[latencies.length - 1] ?? 0),
  });
}
