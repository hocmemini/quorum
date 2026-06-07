import type { Endpoint } from './types';

export interface SpikeConfig {
  /** Endpoints in failover ORDER (us-east-1 first, then us-east-2). */
  endpoints: Endpoint[];
  /** Regions forced unreachable at startup (env DSQL_UNREACHABLE), for manual demos. */
  unreachable: string[];
  /** Event count for the active-active claim. */
  eventCount: number;
}

function req(env: NodeJS.ProcessEnv, key: string): string {
  const v = env[key];
  if (!v) throw new Error(`missing required env ${key} (see packages/spike-failover/.env.example)`);
  return v;
}

/** The witness region (us-west-2) has no endpoint and never appears in the pool. */
export function loadConfig(env: NodeJS.ProcessEnv = process.env): SpikeConfig {
  const endpoints: Endpoint[] = [
    { region: env.DSQL_REGION_USE1 ?? 'us-east-1', host: req(env, 'DSQL_ENDPOINT_USE1') },
    { region: env.DSQL_REGION_USE2 ?? 'us-east-2', host: req(env, 'DSQL_ENDPOINT_USE2') },
  ];
  const unreachable = (env.DSQL_UNREACHABLE ?? '')
    .split(',')
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
  const eventCount = Number(env.SPIKE_EVENTS ?? '50');
  return { endpoints, unreachable, eventCount: Number.isFinite(eventCount) ? eventCount : 50 };
}
