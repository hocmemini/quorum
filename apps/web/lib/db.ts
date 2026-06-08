import { type AppDb, createFailoverDb, endpointsFromEnv, type FailoverDb } from '@quorum/db';
import { attachDatabasePool } from '@vercel/functions';
import { cookies } from 'next/headers';

const CHAOS_COOKIE = 'quorum_chaos_down';
export const CHAOS_COOKIE_NAME = CHAOS_COOKIE;
const ORG_COOKIE = 'quorum_org';
export const ORG_COOKIE_NAME = ORG_COOKIE;

let cached: FailoverDb | undefined;

/**
 * Process-wide, region-failover DSQL handle (server-side only). One pool per region with DEC-015
 * connection warmth: a staggered keep-alive on both pools, recycled under the DSQL session cap. On
 * Vercel, pools are attached so Fluid Compute drains them before suspension. Prefer `query()`.
 */
export function getDb(): FailoverDb {
  if (!cached) {
    cached = createFailoverDb(endpointsFromEnv(), {}, { keepAliveMs: 30_000 });
    if (process.env.VERCEL) {
      for (const pool of cached.pools()) attachDatabasePool(pool);
    }
  }
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

/** The active workspace id from the session cookie (DEC-016), or null if none chosen yet. */
export async function activeOrgId(): Promise<string | null> {
  return (await cookies()).get(ORG_COOKIE)?.value ?? null;
}

/**
 * Observed failover/chaos state for the current request. `serving` is the region whose live
 * connection actually answered a probe (not the cookie), so the indicator proves real failover and
 * returns to the primary the instant chaos is cleared (restore fail-back, workstream C).
 */
export async function chaosState(): Promise<{
  regions: string[];
  down: string[];
  serving: string;
  degraded: boolean;
}> {
  const down = await cookieDownRegions();
  try {
    await query((db) => db.selectFrom('service').select('service_id').limit(1).execute());
  } catch {
    // ignore; serving falls back to the last-served region below
  }
  const regions = getDb().regions();
  const serving = getDb().current();
  const primary = regions[0] ?? serving;
  return { regions, down, serving, degraded: serving !== primary };
}

/** Live per-region health for the system-status panel: probe each pool (chaos regions show down). */
export async function regionHealth(): Promise<
  { region: string; up: boolean; latencyMs: number | null }[]
> {
  const db = getDb();
  const regions = db.regions();
  const pools = db.pools();
  const downSet = new Set(await cookieDownRegions());
  return Promise.all(
    regions.map(async (region, i) => {
      const pool = pools[i];
      if (downSet.has(region) || !pool) return { region, up: false, latencyMs: null };
      const t = performance.now();
      try {
        await pool.query('SELECT 1');
        return { region, up: true, latencyMs: Math.round(performance.now() - t) };
      } catch {
        return { region, up: false, latencyMs: null };
      }
    }),
  );
}
