import { DsqlSigner } from '@aws-sdk/dsql-signer';
import { Kysely, PostgresDialect } from 'kysely';
import type { PoolConfig } from 'pg';
import { Pool } from 'pg';

/**
 * Aurora DSQL connection facts (LOCKED - see CLAUDE.md):
 *  - Port 5432, TLS required.
 *  - The libpq password is a short-lived IAM token (`@aws-sdk/dsql-signer`).
 *  - Generate a token per connection; cache it with a TTL so we don't re-sign on every
 *    physical connect.
 *  - Default database is `postgres`; default role is `admin`.
 */
export interface DsqlConfig {
  /** Cluster endpoint host, e.g. `<id>.dsql.<region>.on.aws`. */
  host: string;
  /** AWS region of this cluster endpoint, e.g. `us-east-1`. */
  region: string;
  /** Database role. `admin` uses the admin token; any other value uses the standard token. */
  user?: string;
  /** Database name. */
  database?: string;
  /** Seconds a cached token is reused before refresh (kept under the token's own TTL). */
  tokenTtlSeconds?: number;
  /** Token validity requested from the signer, in seconds. */
  tokenExpiresInSeconds?: number;
  /** Extra pg pool options (max, idleTimeoutMillis, ...). */
  pool?: Omit<PoolConfig, 'host' | 'port' | 'user' | 'database' | 'password' | 'ssl'>;
}

const DEFAULTS = {
  user: 'admin',
  database: 'postgres',
  port: 5432,
  tokenTtlSeconds: 840, // refresh ~60s before a 900s token expires
  tokenExpiresInSeconds: 900,
} as const;

/**
 * Wrap a token producer in a small TTL cache. The returned function is what pg calls: a
 * `password` function is invoked for every new physical connection, so the cache prevents
 * an SDK sign on each connect while still refreshing before expiry.
 */
export function createTokenProvider(
  produce: () => Promise<string>,
  ttlSeconds: number,
): () => Promise<string> {
  let cache: { token: string; expiresAt: number } | undefined;
  return async () => {
    const now = Date.now();
    if (cache && now < cache.expiresAt) return cache.token;
    const token = await produce();
    cache = { token, expiresAt: now + ttlSeconds * 1000 };
    return token;
  };
}

/** Build a pg Pool wired to DSQL with TTL-cached IAM-token auth. */
export function createDsqlPool(config: DsqlConfig): Pool {
  const user = config.user ?? DEFAULTS.user;
  const database = config.database ?? DEFAULTS.database;
  const ttl = config.tokenTtlSeconds ?? DEFAULTS.tokenTtlSeconds;
  const expiresIn = config.tokenExpiresInSeconds ?? DEFAULTS.tokenExpiresInSeconds;

  const signer = new DsqlSigner({ hostname: config.host, region: config.region, expiresIn });
  const produce = (): Promise<string> =>
    user === 'admin' ? signer.getDbConnectAdminAuthToken() : signer.getDbConnectAuthToken();
  const password = createTokenProvider(produce, ttl);

  return new Pool({
    host: config.host,
    port: DEFAULTS.port,
    user,
    database,
    password,
    ssl: { rejectUnauthorized: true },
    ...config.pool,
  });
}

/**
 * Create a Kysely instance over a DSQL-backed pg Pool. Supply your schema type as `DB`.
 * Returns the pool too, so callers can run hand-written DDL on the raw pool (migrations)
 * while doing typed queries through Kysely.
 */
export function createDb<DB>(config: DsqlConfig): { db: Kysely<DB>; pool: Pool } {
  const pool = createDsqlPool(config);
  const db = new Kysely<DB>({ dialect: new PostgresDialect({ pool }) });
  return { db, pool };
}

/** Read DSQL connection settings from the environment. */
export function dsqlConfigFromEnv(env: NodeJS.ProcessEnv = process.env): DsqlConfig {
  const host = env.DSQL_ENDPOINT_PRIMARY ?? env.DSQL_HOST;
  const region = env.DSQL_REGION ?? env.AWS_REGION;
  if (!host) throw new Error('DSQL endpoint missing: set DSQL_ENDPOINT_PRIMARY (or DSQL_HOST)');
  if (!region) throw new Error('DSQL region missing: set DSQL_REGION (or AWS_REGION)');
  const cfg: DsqlConfig = { host, region };
  if (env.DSQL_USER) cfg.user = env.DSQL_USER;
  if (env.DSQL_DATABASE) cfg.database = env.DSQL_DATABASE;
  return cfg;
}
