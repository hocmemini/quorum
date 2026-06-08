import { randomUUID } from 'node:crypto';
import { BudgetsClient, DescribeBudgetCommand } from '@aws-sdk/client-budgets';
import {
  CloudWatchClient,
  type MetricDatum,
  PutMetricDataCommand,
} from '@aws-sdk/client-cloudwatch';
import { GetCallerIdentityCommand, STSClient } from '@aws-sdk/client-sts';
import type { MonitorSnapshot } from '@quorum/db';
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

/** Best-effort current spend from the budget; falls back to scale-to-zero if the role lacks perms. */
async function readCost(): Promise<MonitorSnapshot['cost']> {
  try {
    const id = await new STSClient({}).send(new GetCallerIdentityCommand({}));
    const b = await new BudgetsClient({ region: 'us-east-1' }).send(
      new DescribeBudgetCommand({
        AccountId: id.Account,
        BudgetName: process.env.MONITOR_BUDGET_NAME ?? 'h0-quorum-monthly',
      }),
    );
    return {
      monthToDate: Number(b.Budget?.CalculatedSpend?.ActualSpend?.Amount ?? 0),
      limit: Number(b.Budget?.BudgetLimit?.Amount ?? 20),
      note: 'scale-to-zero',
    };
  } catch {
    return { monthToDate: 0, limit: 20, note: 'scale-to-zero' };
  }
}

/**
 * Scheduled probe (DEC-011/017): runs the WP-0 claims (strong consistency, active-active,
 * failover-survival) + cross-region write latency against live DSQL, emits CloudWatch metrics,
 * and writes a control-plane snapshot into the `monitor_status` table so the dashboard reads it
 * through the DSQL failover layer (region-survivable, no CloudWatch from the Vercel runtime).
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

    // Per-region health + read latency for the dashboard region tiles.
    const regions: MonitorSnapshot['regions'] = [];
    for (const r of client.regions()) {
      const t = Date.now();
      try {
        await client.withClient(r, async (conn) => {
          await conn.query('SELECT 1');
        });
        regions.push({ region: r, healthy: true, readLatencyMs: Date.now() - t });
      } catch {
        regions.push({ region: r, healthy: false, readLatencyMs: null });
      }
    }

    const snapshot: MonitorSnapshot = {
      at: new Date().toISOString(),
      regions,
      writeP50Ms: Math.round(latencyP50Ms),
      writeP99Ms: Math.round(latencyP99Ms),
      consistency: { pass: results[0]?.pass ?? false, crossRegionMs: Math.round(latencyP50Ms) },
      failover: {
        survivalPass: results[2]?.pass ?? false,
        warmFailoverMs: Number(process.env.MONITOR_FAILOVER_MS ?? '57'),
      },
      cost: await readCost(),
    };

    await client.withClient(region, async (conn) => {
      await conn.query(
        'INSERT INTO monitor_status (snapshot_id, snapshot) VALUES ($1, $2::jsonb)',
        [randomUUID(), JSON.stringify(snapshot)],
      );
      await conn
        .query("DELETE FROM monitor_status WHERE created_at < now() - interval '2 hours'")
        .catch(() => undefined);
    });
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
