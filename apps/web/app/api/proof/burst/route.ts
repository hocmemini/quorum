import { randomUUID } from 'node:crypto';
import { getDb, survivorState } from '@/lib/db';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// 50 concurrent writes proving one consistent log (DEC-018/021), now chaos-aware (DEC-023). Both
// regions up: alternate both, then read both back identical (zero divergence). A region failed for the
// session: all 50 go to the survivor, durable via quorum, dropping the both-regions-read claim and
// never calling the down region.
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

  const total = 50;
  const latencies: number[] = [];
  let committed = 0;
  let conflicts = 0;
  const round = (n: number) => Math.round(n * 10) / 10;
  const onWrite = (t: number) => {
    committed++;
    latencies.push(performance.now() - t);
  };
  const onErr = (e: unknown) => {
    if ((e as { code?: string }).code === '40001') conflicts++;
    else throw e;
  };
  const spread = () => {
    latencies.sort((x, y) => x - y);
    const pick = (q: number) =>
      latencies[Math.min(latencies.length - 1, Math.floor(q * latencies.length))] ?? 0;
    return {
      minMs: round(latencies[0] ?? 0),
      p50Ms: round(pick(0.5)),
      maxMs: round(latencies[latencies.length - 1] ?? 0),
    };
  };

  // Survivor-only during a simulated outage: every write to the one region still up.
  if (up.length < regions.length) {
    const survivor = up[0];
    if (!survivor) return Response.json({ degraded: true });
    const pool = survivor === rA ? pA : pB;
    await Promise.all(
      Array.from({ length: total }, (_, i) => {
        const t = performance.now();
        return pool
          .query(
            "INSERT INTO spike_event (event_id, origin_region, seq, payload) VALUES ($1, $2, $3, '{}'::jsonb)",
            [randomUUID(), survivor, Date.now() * 1000 + i],
          )
          .then(() => onWrite(t))
          .catch(onErr);
      }),
    );
    return Response.json({
      survivorOnly: true,
      survivor,
      witness,
      total,
      committed,
      conflicts,
      ...spread(),
    });
  }

  // Both regions up: alternate both, then read this run's log back from both regions.
  const runId = randomUUID();
  const payload = JSON.stringify({ burst: runId });
  await Promise.all(
    Array.from({ length: total }, (_, i) => {
      const idx = i % 2;
      const pool = idx === 0 ? pA : pB;
      const region = idx === 0 ? rA : rB;
      const t = performance.now();
      return pool
        .query(
          'INSERT INTO spike_event (event_id, origin_region, seq, payload) VALUES ($1, $2, $3, $4::jsonb)',
          [randomUUID(), region, Date.now() * 1000 + i, payload],
        )
        .then(() => onWrite(t))
        .catch(onErr);
    }),
  );
  const [a, b] = await Promise.all([
    pA.query("SELECT count(*)::int AS n FROM spike_event WHERE payload->>'burst' = $1", [runId]),
    pB.query("SELECT count(*)::int AS n FROM spike_event WHERE payload->>'burst' = $1", [runId]),
  ]);
  const countA = Number(a.rows[0]?.n ?? 0);
  const countB = Number(b.rows[0]?.n ?? 0);
  return Response.json({
    total,
    committed,
    conflicts,
    countA,
    countB,
    diverged: countA !== countB,
    ...spread(),
  });
}
