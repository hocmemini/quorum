import { randomUUID } from 'node:crypto';
import { performance } from 'node:perf_hooks';
import type { FailoverClient } from './failover-client';

export interface ClaimResult {
  id: string;
  name: string;
  pass: boolean;
  detail: string;
}

export interface LatencyStats {
  samples: number;
  medianMs: number;
  p99Ms: number;
}

const INSERT =
  'INSERT INTO spike_event (event_id, origin_region, seq, payload) VALUES ($1, $2, $3, $4)';

async function insertEvent(
  client: FailoverClient,
  region: string | undefined,
  origin: string,
  seq: number,
  runId: string,
): Promise<{ ms: number; eventId: string }> {
  const eventId = randomUUID();
  const start = performance.now();
  await client.write(
    INSERT,
    [eventId, origin, seq, JSON.stringify({ run_id: runId, seq })],
    region === undefined ? {} : { region },
  );
  return { ms: performance.now() - start, eventId };
}

async function readRunIds(
  client: FailoverClient,
  region: string,
  runId: string,
): Promise<Set<string>> {
  const { rows } = await client.read<{ event_id: string }>(
    "SELECT event_id FROM spike_event WHERE payload->>'run_id' = $1",
    [runId],
    { region },
  );
  return new Set(rows.map((r) => r.event_id));
}

/** Claim 1 - strong consistency: write via region A, immediately read via region B (no polling). */
export async function claimStrongConsistency(
  client: FailoverClient,
  runId: string,
): Promise<ClaimResult> {
  const name = 'Strong consistency (write A -> read B)';
  const [a, b] = client.regions();
  if (a === undefined || b === undefined) {
    return { id: 'C1', name, pass: false, detail: 'need two regions' };
  }
  const eventId = randomUUID();
  await client.write(INSERT, [eventId, a, 1, JSON.stringify({ run_id: runId })], { region: a });
  const { rows } = await client.read<{ event_id: string }>(
    'SELECT event_id FROM spike_event WHERE event_id = $1',
    [eventId],
    { region: b },
  );
  const pass = rows.length === 1;
  return {
    id: 'C1',
    name,
    pass,
    detail: pass
      ? `wrote via ${a}, read back via ${b} with no polling`
      : `event not visible in ${b} immediately after commit in ${a}`,
  };
}

/** Claim 2 - active-active: concurrent writes from both endpoints, full set readable from both. */
export async function claimActiveActive(
  client: FailoverClient,
  runId: string,
  n: number,
): Promise<{ result: ClaimResult; latencies: number[] }> {
  const name = 'Active-active (concurrent dual-region writes)';
  const [a, b] = client.regions();
  if (a === undefined || b === undefined) {
    return { result: { id: 'C2', name, pass: false, detail: 'need two regions' }, latencies: [] };
  }
  const tasks: Array<Promise<{ ms: number; eventId: string }>> = [];
  for (let i = 0; i < n; i += 1) {
    const origin = i % 2 === 0 ? a : b;
    tasks.push(insertEvent(client, origin, origin, i, runId));
  }
  const written = await Promise.all(tasks);
  const ids = written.map((w) => w.eventId);
  const latencies = written.map((w) => w.ms);

  const fromA = await readRunIds(client, a, runId);
  const fromB = await readRunIds(client, b, runId);
  const allInA = ids.every((id) => fromA.has(id));
  const allInB = ids.every((id) => fromB.has(id));
  const pass = allInA && allInB && setsEqual(fromA, fromB);
  return {
    result: {
      id: 'C2',
      name,
      pass,
      detail: pass
        ? `${n} concurrent writes split across ${a}/${b}; both regions return the identical complete set (${fromA.size} events)`
        : `lost/diverged: A_has_all=${allInA} B_has_all=${allInB} |A|=${fromA.size} |B|=${fromB.size}`,
    },
    latencies,
  };
}

/** Claim 3 - survival: kill region A, write+read via B, restore A, assert it caught up. */
export async function claimSurvival(client: FailoverClient, runId: string): Promise<ClaimResult> {
  const name = 'Region-failure survival';
  const [a, b] = client.regions();
  if (a === undefined || b === undefined) {
    return { id: 'C3', name, pass: false, detail: 'need two regions' };
  }
  client.reset();
  await client.write(
    INSERT,
    [randomUUID(), a, 100, JSON.stringify({ run_id: runId, phase: 'pre' })],
    { region: a },
  );

  // Outage: A unreachable - writes/reads must transparently fail over to B.
  client.markUnreachable(a);
  const outageIds: string[] = [];
  for (let i = 0; i < 5; i += 1) {
    const id = randomUUID();
    await client.write(INSERT, [
      id,
      b,
      200 + i,
      JSON.stringify({ run_id: runId, phase: 'outage' }),
    ]);
    outageIds.push(id);
  }
  const duringOutage = await client.read<{ event_id: string }>(
    "SELECT event_id FROM spike_event WHERE payload->>'run_id' = $1 AND payload->>'phase' = 'outage'",
    [runId],
  );
  const survived = duringOutage.region === b && duringOutage.rows.length === outageIds.length;

  // Restore A, reconnect, assert A returns every event written during the outage.
  client.markReachable(a);
  const onA = await client.read<{ event_id: string }>(
    "SELECT event_id FROM spike_event WHERE payload->>'run_id' = $1 AND payload->>'phase' = 'outage'",
    [runId],
    { region: a },
  );
  const caughtUp = onA.rows.length === outageIds.length;

  const pass = survived && caughtUp;
  return {
    id: 'C3',
    name,
    pass,
    detail: pass
      ? `wrote ${outageIds.length} via ${b} while ${a} down; ${a} returned all ${onA.rows.length} after restore`
      : `survived=${survived} (outage read region=${duringOutage.region}); ${a} caughtUp=${caughtUp} (${onA.rows.length}/${outageIds.length})`,
  };
}

export function latencyStats(input: number[]): LatencyStats {
  const samples = [...input].sort((x, y) => x - y);
  if (samples.length === 0) return { samples: 0, medianMs: 0, p99Ms: 0 };
  const at = (p: number): number =>
    samples[Math.min(samples.length - 1, Math.floor(p * samples.length))] ?? 0;
  return { samples: samples.length, medianMs: round2(at(0.5)), p99Ms: round2(at(0.99)) };
}

function setsEqual(x: Set<string>, y: Set<string>): boolean {
  if (x.size !== y.size) return false;
  for (const v of x) if (!y.has(v)) return false;
  return true;
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}
