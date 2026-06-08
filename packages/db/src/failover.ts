import type { Kysely } from 'kysely';
import { createDb, type DsqlConfig } from './client';
import { isConnectionError } from './occ';
import type { Database } from './schema';

export interface RegionEndpoint {
  region: string;
  host: string;
}

export interface FailoverDb {
  /** Run an operation against the current region; on a connection error, fail over and retry. */
  run<T>(fn: (db: Kysely<Database>) => Promise<T>): Promise<T>;
  /** Region that served the last successful operation (or the configured primary). */
  current(): string;
  regions(): string[];
  close(): Promise<void>;
}

/**
 * Try `attempts` in rotation starting at `startIndex`; return the first success and report its
 * index via `onSuccess` (so the caller can stick to the region that worked). A connection error
 * advances to the next region; any other error (validation, OCC-exhausted) is thrown immediately.
 * Pure and Kysely-free, so the failover policy is unit-testable on its own.
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

/**
 * Region-aware Kysely over a peered DSQL pair (DEC-006: carries the WP-0 failover forward). One
 * pool per region; `run()` prefers the last-good region and sticks to whichever region serves the
 * request, so a regional outage transparently moves work to the survivor. Retrying `fn` on the
 * failover region is safe because writes are idempotent on the event/anchor id (DEC-005) and reads
 * are side-effect free.
 */
export function createFailoverDb(
  endpoints: ReadonlyArray<RegionEndpoint>,
  config: Partial<Omit<DsqlConfig, 'host' | 'region'>> = {},
): FailoverDb {
  if (endpoints.length === 0) throw new Error('createFailoverDb: at least one endpoint required');
  const states = endpoints.map((ep) =>
    createDb<Database>({ host: ep.host, region: ep.region, ...config }),
  );
  let current = 0;

  return {
    run<T>(fn: (db: Kysely<Database>) => Promise<T>): Promise<T> {
      const attempts = states.map((s) => () => fn(s.db));
      return runWithFailover(attempts, current, (idx) => {
        current = idx;
      });
    },
    current(): string {
      return endpoints[current]?.region ?? endpoints[0]?.region ?? '';
    },
    regions(): string[] {
      return endpoints.map((e) => e.region);
    },
    async close(): Promise<void> {
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
