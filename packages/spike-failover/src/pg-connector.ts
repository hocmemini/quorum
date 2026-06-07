import type { PoolClient } from 'pg';
import { Pool } from 'pg';
import { createTokenProvider, type TokenOptions } from './token';
import type { Conn, Connector, Endpoint } from './types';

export interface PgConnectorOptions extends TokenOptions {
  connectionTimeoutMillis?: number;
  /** Per-query timeout; a hung query trips failover. */
  queryTimeoutMillis?: number;
  maxPoolSize?: number;
}

/** Real pg-backed connector: one Pool per endpoint, password = TTL-cached IAM token. */
export class PgConnector implements Connector {
  private readonly pools = new Map<string, Pool>();
  private readonly options: PgConnectorOptions;

  constructor(options: PgConnectorOptions = {}) {
    this.options = options;
  }

  private poolFor(endpoint: Endpoint): Pool {
    const existing = this.pools.get(endpoint.region);
    if (existing) return existing;
    const pool = new Pool({
      host: endpoint.host,
      port: 5432,
      user: this.options.user ?? 'admin',
      database: 'postgres',
      password: createTokenProvider(endpoint.host, endpoint.region, this.options),
      ssl: { rejectUnauthorized: true },
      max: this.options.maxPoolSize ?? 10,
      connectionTimeoutMillis: this.options.connectionTimeoutMillis ?? 5000,
      query_timeout: this.options.queryTimeoutMillis ?? 15000,
      // DSQL drops connections after 1h; recycle well before that.
      maxLifetimeSeconds: 1800,
    });
    this.pools.set(endpoint.region, pool);
    return pool;
  }

  async connect(endpoint: Endpoint): Promise<Conn> {
    const client: PoolClient = await this.poolFor(endpoint).connect();
    return {
      query: async <R = Record<string, unknown>>(sql: string, params?: readonly unknown[]) => {
        const res = await client.query(sql, params as unknown[] | undefined);
        return { rows: res.rows as R[] };
      },
      release: () => {
        client.release();
      },
    };
  }

  async end(): Promise<void> {
    await Promise.all([...this.pools.values()].map((p) => p.end()));
    this.pools.clear();
  }
}
