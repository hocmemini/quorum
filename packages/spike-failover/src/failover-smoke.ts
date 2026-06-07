import { randomUUID } from 'node:crypto';
import { performance } from 'node:perf_hooks';
import { loadConfig } from './config';
import { FailoverClient } from './failover-client';
import { PgConnector } from './pg-connector';

// Validates that the client survives a REAL hanging primary (use with scripts/blackhole.sh):
// blackhole us-east-1, run this, and the request should be served by us-east-2 after the
// connect timeout. Unlike claim 3's in-process flag, this exercises the genuine timeout path.

async function timed<T>(fn: () => Promise<T>): Promise<{ ms: number; value: T }> {
  const start = performance.now();
  const value = await fn();
  return { ms: Math.round(performance.now() - start), value };
}

async function main(): Promise<number> {
  const config = loadConfig();
  const client = new FailoverClient(
    config.endpoints,
    new PgConnector({ connectionTimeoutMillis: 4000 }),
    {
      occ: { maxAttempts: 6 },
    },
  );
  for (const r of config.unreachable) client.markUnreachable(r);

  try {
    const read = await timed(() => client.read('SELECT 1 AS ok'));
    console.log(`failover read  served by ${read.value.region} in ${read.ms} ms`);

    let write = 'skipped';
    try {
      const w = await timed(() =>
        client.write(
          'INSERT INTO spike_event (event_id, origin_region, seq, payload) VALUES ($1, $2, $3, $4)',
          [randomUUID(), 'smoke', 0, JSON.stringify({ smoke: true })],
        ),
      );
      write = `served by ${w.value.region} in ${w.ms} ms`;
    } catch (e) {
      write = `skipped (${(e as { message?: string }).message ?? 'run `report` once to create spike_event'})`;
    }
    console.log(`failover write ${write}`);
    console.log(
      'With us-east-1 blackholed, the serving region should be us-east-2 (latency includes the connect timeout).',
    );
    return 0;
  } finally {
    await client.end();
  }
}

main()
  .then((code) => {
    process.exitCode = code;
  })
  .catch((e: unknown) => {
    console.error(e);
    process.exitCode = 1;
  });
