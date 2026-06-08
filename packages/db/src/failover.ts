import type { Kysely } from 'kysely';
import type { Pool } from 'pg';
import { createDb, type DsqlConfig } from './client';
import { isConnectionError } from './occ';
import type { Database } from './schema';

export interface RegionEndpoint {
  region: string;
  host: string;
}

/** The Kysely handle a failover operation receives (lets consumers avoid a direct kysely import). */
export type AppDb = Kysely<Database>;

export interface FailoverDb {
  /**
   * Run an operation, preferring the primary region and failing over to the survivor on a
   * connection error. `opts.downRegions` adds request-scoped partitioned regions (the judge-facing
   * chaos demo), merged with any configured ones.
   */
  run<T>(
    fn: (db: Kysely<Database>) => Promise<T>,
    opts?: { downRegions?: Iterable<string> },
  ): Promise<T>;
  /** The region whose live connection actually served the last operation (observed, not assumed). */
  current(): string;
  regions(): string[];
  /** The underlying per-region pools (for Vercel attachDatabasePool / draining on suspend). */
  pools(): Pool[];
  close(): Promise<void>;
}

/**
 * Try `attempts` in rotation starting at `startIndex`; return the first success and report its
 * index via `onSuccess`. A connection error advances to the next region; any other error
 * (validation, OCC-exhausted) is thrown immediately. Pure and Kysely-free, so the failover policy
 * is unit-testable on its own.
 */
export async function runWithFailover<T>(
  attempts: ReadonlyArray<() => Promise<T>>,
  startIndex: number,
  onSuccess: (index: number) => void,
): Promise<T> {
  if (attempts.length === 0) throw new Error('runWithFailover: no attempts');
  let lastErr: unknown;
  for (let t = 0; t < attempts.length; t++) {
    const idx = (startIndex + t) % attempts.length;
    const attempt = attempts[idx];
    if (!attempt) continue;
    try {
      const result = await attempt();
      onSuccess(idx);
      return result;
    } catch (e) {
      if (isConnectionError(e)) {
        lastErr = e;
        continue;
      }
      throw e;
    }
  }
  throw lastErr ?? new Error('all regions unavailable');
}

/** Regions to treat as partitioned for the chaos demo (WP-9), from QUORUM_CHAOS_DOWN_REGIONS. */
export function chaosDownRegions(env: NodeJS.ProcessEnv = process.env): string[] {
  return (env.QUORUM_CHAOS_DOWN_REGIONS ?? '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
}

/**
 * Region-aware Kysely over a peered DSQL pair (DEC-006). One pool per region. `run()` always tries
 * the primary first and fails over to the survivor on a connection error, so the moment a chaos
 * partition is cleared, work automatically returns to the primary (clean restore / fail-back).
 * `current()` reports the region whose connection actually served the last call, so the UI shows
 * the observed serving region, not an assumption. Retrying `fn` on the survivor is safe because
 * writes are idempotent on the event/anchor id (DEC-005).
 *
 * Connection warmth (DEC-015): each pool gets a randomized `maxLifetimeSeconds` under the DSQL
 * one-hour session cap (staggered recycles) and a bounded connect timeout; `options.keepAliveMs`
 * runs a staggered `SELECT 1` on every region pool so a judge-triggered failover lands on a warm
 * socket (~57 ms) instead of a cold connect (~595 ms). `options.downRegions` (default
 * QUORUM_CHAOS_DOWN_REGIONS) marks regions partitioned so the demo can force a failover.
 */
export function createFailoverDb(
  endpoints: ReadonlyArray<RegionEndpoint>,
  config: Partial<Omit<DsqlConfig, 'host' | 'region'>> = {},
  options: { downRegions?: Iterable<string>; keepAliveMs?: number } = {},
): FailoverDb {
  if (endpoints.length === 0) throw new Error('createFailoverDb: at least one endpoint required');
  const states = endpoints.map((ep) => {
    const jitter = Math.floor(Math.random() * 300);
    return createDb<Database>({
      host: ep.host,
      region: ep.region,
      ...config,
      pool: { maxLifetimeSeconds: 2700 + jitter, connectionTimeoutMillis: 3000, ...config.pool },
    });
  });
  const down = new Set(options.downRegions ?? chaosDownRegions());
  let lastServed = endpoints[0]?.region ?? '';

  const timers: ReturnType<typeof setInterval>[] = [];
  const keepAliveMs = options.keepAliveMs ?? 0;
  if (keepAliveMs > 0) {
    states.forEach((s, i) => {
      const ping = () => {
        s.pool.query('SELECT 1').catch(() => undefined);
      };
      const startTimer = setTimeout(
        ping,
        Math.floor((keepAliveMs / Math.max(states.length, 1)) * i),
      );
      const interval = setInterval(ping, keepAliveMs);
      startTimer.unref?.();
      interval.unref?.();
      timers.push(interval);
    });
  }

  return {
    run<T>(
      fn: (db: Kysely<Database>) => Promise<T>,
      opts: { downRegions?: Iterable<string> } = {},
    ): Promise<T> {
      const callDown = opts.downRegions ? new Set([...down, ...opts.downRegions]) : down;
      const attempts = states.map((s, i) => () => {
        const region = endpoints[i]?.region;
        if (region && callDown.has(region)) {
          return Promise.reject(
            Object.assign(new Error(`chaos: region ${region} marked down`), {
              code: 'ECONNREFUSED',
            }),
          );
        }
        return fn(s.db);
      });
      return runWithFailover(attempts, 0, (idx) => {
        lastServed = endpoints[idx]?.region ?? lastServed;
      });
    },
    current(): string {
      return lastServed;
    },
    regions(): string[] {
      return endpoints.map((e) => e.region);
    },
    pools(): Pool[] {
      return states.map((s) => s.pool);
    },
    async close(): Promise<void> {
      for (const t of timers) clearInterval(t);
      await Promise.all(states.map((s) => s.pool.end()));
    },
  };
}

/** Region endpoint list from the environment: primary required, secondary optional. */
export function endpointsFromEnv(env: NodeJS.ProcessEnv = process.env): RegionEndpoint[] {
  const primaryHost = env.DSQL_ENDPOINT_PRIMARY;
  if (!primaryHost) throw new Error('DSQL_ENDPOINT_PRIMARY is required');
  const endpoints: RegionEndpoint[] = [
    { region: env.DSQL_REGION_PRIMARY ?? env.DSQL_REGION ?? 'us-east-1', host: primaryHost },
  ];
  const secondaryHost = env.DSQL_ENDPOINT_SECONDARY;
  if (secondaryHost) {
    endpoints.push({ region: env.DSQL_REGION_SECONDARY ?? 'us-east-2', host: secondaryHost });
  }
  return endpoints;
}
