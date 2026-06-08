import { type AppDb, createFailoverDb, endpointsFromEnv, type FailoverDb } from '@quorum/db';
import { cookies } from 'next/headers';

const CHAOS_COOKIE = 'quorum_chaos_down';
export const CHAOS_COOKIE_NAME = CHAOS_COOKIE;

let cached: FailoverDb | undefined;

/**
 * Process-wide, region-failover DSQL handle for the app (server-side only). One pool per region;
 * operations fail over on a connection error (DEC-006). Prefer `query()` so requests honor the
 * session chaos cookie.
 */
export function getDb(): FailoverDb {
  cached ??= createFailoverDb(endpointsFromEnv());
  return cached;
}

async function cookieDownRegions(): Promise<string[]> {
  const raw = (await cookies()).get(CHAOS_COOKIE)?.value ?? '';
  return raw
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
}

/** Run a DB op with request-scoped chaos applied (the failover demo cookie). Server-only. */
export async function query<T>(fn: (db: AppDb) => Promise<T>): Promise<T> {
  return getDb().run(fn, { downRegions: await cookieDownRegions() });
}

/** Failover/chaos state for the current request, for the header and the ChaosPanel. */
export async function chaosState(): Promise<{
  regions: string[];
  down: string[];
  serving: string;
  degraded: boolean;
}> {
  const regions = getDb().regions();
  const down = await cookieDownRegions();
  const downSet = new Set(down);
  const serving = regions.find((r) => !downSet.has(r)) ?? regions[0] ?? 'unknown';
  return { regions, down, serving, degraded: down.length > 0 };
}
