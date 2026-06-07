import { randomUUID } from 'node:crypto';
import {
  CloudWatchClient,
  type MetricDatum,
  PutMetricDataCommand,
} from '@aws-sdk/client-cloudwatch';
import {
  type ClaimResult,
  claimActiveActive,
  claimStrongConsistency,
  claimSurvival,
  FailoverClient,
  latencyStats,
  loadConfig,
  PgConnector,
} from '@quorum/spike-failover';

const NAMESPACE = 'Quorum/DSQLMonitor';

// Isolated probe table in the target cluster (kept separate from app tables).
const PROBE_DDL =
  'CREATE TABLE IF NOT EXISTS spike_event (event_id uuid PRIMARY KEY, origin_region text NOT NULL, ' +
  'seq bigint NOT NULL, payload jsonb NOT NULL, created_at timestamptz NOT NULL DEFAULT now())';

export interface MonitorResult {
  ok: boolean;
  results: ClaimResult[];
  latencyP50Ms: number;
  latencyP99Ms: number;
}

/**
 * Scheduled probe (DEC-011): runs the WP-0 claims (strong consistency, active-active,
 * failover-survival) + cross-region write latency against live DSQL and emits CloudWatch
 * metrics. Real network-partition tests stay manual (NACL / FIS).
 */
export const handler = async (): Promise<MonitorResult> => {
  const config = loadConfig();
  const client = new FailoverClient(config.endpoints, new PgConnector(), {
    occ: { maxAttempts: 10 },
  });
  const region = client.regions()[0];
  if (region === undefined) throw new Error('no DSQL endpoints configured');

  const runId = randomUUID();
  const results: ClaimResult[] = [];
  let latencyP50Ms = 0;
  let latencyP99Ms = 0;

  try {
    await client.withClient(region, async (conn) => {
      await conn.query('BEGIN'); // one DDL per transaction (DSQL)
      try {
        await conn.query(PROBE_DDL);
        await conn.query('COMMIT');
      } catch (e) {
        await conn.query('ROLLBACK').catch(() => undefined);
        throw e;
      }
    });

    results.push(await claimStrongConsistency(client, runId));
    const active = await claimActiveActive(
      client,
      runId,
      Number(process.env.MONITOR_EVENTS ?? '10'),
    );
    results.push(active.result);
    const lat = latencyStats(active.latencies);
    latencyP50Ms = lat.medianMs;
    latencyP99Ms = lat.p99Ms;
    results.push(await claimSurvival(client, runId));
  } finally {
    await client.end();
  }

  const ok = results.every((r) => r.pass);
  await emitMetrics(results, latencyP50Ms, latencyP99Ms);
  return { ok, results, latencyP50Ms, latencyP99Ms };
};

async function emitMetrics(results: ClaimResult[], p50: number, p99: number): Promise<void> {
  const timestamp = new Date();
  const metrics: MetricDatum[] = [
    ...results.map(
      (r): MetricDatum => ({
        MetricName: 'ClaimPass',
        Dimensions: [{ Name: 'Claim', Value: r.id }],
        Value: r.pass ? 1 : 0,
        Unit: 'Count',
        Timestamp: timestamp,
      }),
    ),
    { MetricName: 'WriteLatencyP50', Value: p50, Unit: 'Milliseconds', Timestamp: timestamp },
    { MetricName: 'WriteLatencyP99', Value: p99, Unit: 'Milliseconds', Timestamp: timestamp },
  ];
  const cw = new CloudWatchClient({});
  await cw.send(new PutMetricDataCommand({ Namespace: NAMESPACE, MetricData: metrics }));
}
