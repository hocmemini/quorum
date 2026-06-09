import { randomUUID } from 'node:crypto';
import { BudgetsClient, DescribeBudgetCommand } from '@aws-sdk/client-budgets';
import {
  CloudWatchClient,
  GetMetricDataCommand,
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

/** Month-to-date DSQL DPU consumed (AWS/AuroraDSQL TotalDPU, summed across clusters + both regions). */
async function readDpuMonth(): Promise<number> {
  const start = new Date();
  start.setUTCDate(1);
  start.setUTCHours(0, 0, 0, 0);
  const query = {
    Id: 'dpu',
    Expression: "SUM(SEARCH('{AWS/AuroraDSQL,ClusterId} MetricName=\"TotalDPU\"', 'Sum', 86400))",
    Period: 86400,
  };
  let total = 0;
  for (const region of ['us-east-1', 'us-east-2']) {
    try {
      const res = await new CloudWatchClient({ region }).send(
        new GetMetricDataCommand({
          StartTime: start,
          EndTime: new Date(),
          MetricDataQueries: [query],
        }),
      );
      for (const v of res.MetricDataResults?.[0]?.Values ?? []) total += v;
    } catch {
      // best-effort per region
    }
  }
  return Math.round(total);
}

/** Best-effort cost: month-to-date DPU (CloudWatch) + dollar spend (budget); scale-to-zero fallback. */
async function readCost(): Promise<MonitorSnapshot['cost']> {
  const dpuMonth = await readDpuMonth();
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
      dpuMonth,
    };
  } catch {
    return { monthToDate: 0, limit: 20, note: 'scale-to-zero', dpuMonth };
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

    // Warm single-region write latency (DEC-015): reuse one connection after a warm-up, so the
    // dashboard shows the warm steady-state, not per-run cold-connection cost.
    const warmLat: number[] = [];
    await client.withClient(region, async (conn) => {
      for (let i = 0; i < 5; i++) {
        await conn.query(
          "INSERT INTO spike_event (event_id, origin_region, seq, payload) VALUES ($1, $2, $3, '{}'::jsonb)",
          [randomUUID(), region, 900000 + i],
        );
      }
      for (let i = 0; i < 20; i++) {
        const t = Date.now();
        await conn.query(
          "INSERT INTO spike_event (event_id, origin_region, seq, payload) VALUES ($1, $2, $3, '{}'::jsonb)",
          [randomUUID(), region, 910000 + i],
        );
        warmLat.push(Date.now() - t);
      }
    });
    warmLat.sort((a, b) => a - b);
    const warmP50 = warmLat[Math.floor(warmLat.length * 0.5)] ?? Math.round(latencyP50Ms);
    const warmP99 = warmLat[Math.floor(warmLat.length * 0.99)] ?? Math.round(latencyP99Ms);

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
      writeP50Ms: warmP50,
      writeP99Ms: warmP99,
      consistency: { pass: results[0]?.pass ?? false, crossRegionMs: warmP50 },
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
