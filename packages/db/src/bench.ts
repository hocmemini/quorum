import { randomUUID } from 'node:crypto';
import type { Kysely } from 'kysely';
import { createDsqlPool, dsqlConfigFromEnv } from './client';
import { createFailoverDb, endpointsFromEnv } from './failover';
import type { Database } from './schema';

// Warm-path benchmark for DEC-015: separate one-time connect cost from steady-state commit cost,
// and measure real failover time (cold vs warm survivor). Run against the live cluster; the rows it
// writes are throwaway, clear them with scripts/wipe-db.sh afterward.

function pct(sorted: number[], p: number): number {
  if (sorted.length === 0) return 0;
  return sorted[Math.min(sorted.length - 1, Math.floor(p * sorted.length))] ?? 0;
}

async function warmWriteLatency(n: number): Promise<void> {
  const pool = createDsqlPool({ ...dsqlConfigFromEnv(), pool: { max: 1 } });
  const t0 = performance.now();
  const client = await pool.connect();
  const connectMs = performance.now() - t0;
  const incidentId = randomUUID();
  const lat: number[] = [];
  try {
    for (let i = 0; i < n; i++) {
      const t = performance.now();
      await client.query(
        `INSERT INTO incident_event (event_id, incident_id, type, payload, actor, origin_region)
         VALUES ($1, $2, 'note.added', $3::jsonb, 'bench', 'us-east-1')`,
        [randomUUID(), incidentId, JSON.stringify({ body: `bench ${i}` })],
      );
      lat.push(performance.now() - t);
    }
  } finally {
    client.release();
    await pool.end();
  }
  lat.sort((a, b) => a - b);
  console.log(
    `[warm write] cold-connect=${connectMs.toFixed(0)}ms  n=${n}  p50=${pct(lat, 0.5).toFixed(1)}ms  p99=${pct(lat, 0.99).toFixed(1)}ms  min=${(lat[0] ?? 0).toFixed(1)}ms`,
  );
}

async function failoverTime(): Promise<void> {
  const eps = endpointsFromEnv();
  if (eps.length < 2) {
    console.log('[failover] skipped: set DSQL_ENDPOINT_SECONDARY to measure');
    return;
  }
  const primary = eps[0]?.region ?? '';
  const probe = (k: Kysely<Database>) =>
    k.selectFrom('service').select('service_id').limit(1).execute();

  const warm = createFailoverDb(eps);
  try {
    await warm.run(probe); // warm the primary
    const t = performance.now();
    await warm.run(probe);
    console.log(
      `[failover] warm primary read=${(performance.now() - t).toFixed(1)}ms (${warm.current()})`,
    );
  } finally {
    await warm.close();
  }

  const cold = createFailoverDb(eps);
  try {
    const t = performance.now();
    await cold.run(probe, { downRegions: [primary] }); // primary down, survivor connects cold
    console.log(
      `[failover] primary down -> survivor ${cold.current()}: ${(performance.now() - t).toFixed(0)}ms (cold survivor; DEC-015 keep-alive removes this connect cost)`,
    );
  } finally {
    await cold.close();
  }
}

async function main(): Promise<void> {
  await warmWriteLatency(Number(process.env.BENCH_N ?? 200));
  await failoverTime();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
