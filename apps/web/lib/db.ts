import { createFailoverDb, endpointsFromEnv, type FailoverDb } from '@quorum/db';

let cached: FailoverDb | undefined;

/**
 * Process-wide, region-failover DSQL handle for the app (server-side only). One pool per region;
 * operations fail over on a connection error (DEC-006). Import this only from server components,
 * route handlers, or server actions, never from client code.
 */
export function getDb(): FailoverDb {
  cached ??= createFailoverDb(endpointsFromEnv());
  return cached;
}
