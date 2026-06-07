import { type OccOptions, withOccRetry } from './occ';
import type { Conn, Connector, Endpoint } from './types';
import { NoEndpointAvailableError } from './types';

export interface FailoverClientOptions {
  occ?: OccOptions;
}

/** Connection/transport error codes that should trigger failover to the next endpoint. */
const CONNECTION_ERROR_CODES = new Set([
  'ECONNREFUSED',
  'ECONNRESET',
  'ETIMEDOUT',
  'ENOTFOUND',
  'EPIPE',
  'EAI_AGAIN',
  '08000', // connection_exception
  '08001', // sqlclient_unable_to_establish_sqlconnection
  '08003', // connection_does_not_exist
  '08006', // connection_failure
  '57P01', // admin_shutdown
  '57P03', // cannot_connect_now
]);

function errMessage(e: unknown): string {
  return typeof e === 'object' && e !== null && 'message' in e
    ? String((e as { message: unknown }).message)
    : String(e);
}

function isConnectionError(e: unknown): boolean {
  if (typeof e !== 'object' || e === null) return false;
  const code = (e as { code?: unknown }).code;
  if (typeof code === 'string' && CONNECTION_ERROR_CODES.has(code)) return true;
  return /timeout|terminat|connection|ECONN|getaddrinfo/i.test(errMessage(e));
}

/**
 * Multi-region DSQL client over an ORDERED endpoint list.
 *  - Obtains an IAM token per connection (delegated to the Connector).
 *  - Transparently fails over to the next reachable endpoint on a connection error/timeout.
 *  - Wraps writes in OCC retry (SQLSTATE 40001); never wraps reads.
 *  - `markUnreachable(region)` simulates a regional outage by removing it from the pool.
 *
 * NOTE: the simulated outage (`markUnreachable`) exists for this spike. The final demo
 * upgrades it to a REAL network partition via a deny-all NACL or AWS Fault Injection Service
 * (FIS), so the survival proof is a true partition rather than an app-level flag.
 */
export class FailoverClient {
  private readonly unreachable = new Set<string>();

  constructor(
    private readonly endpoints: readonly Endpoint[],
    private readonly connector: Connector,
    private readonly options: FailoverClientOptions = {},
  ) {
    if (endpoints.length === 0) throw new Error('FailoverClient requires at least one endpoint');
  }

  markUnreachable(region: string): void {
    this.unreachable.add(region);
  }

  markReachable(region: string): void {
    this.unreachable.delete(region);
  }

  reset(): void {
    this.unreachable.clear();
  }

  regions(): string[] {
    return this.endpoints.map((e) => e.region);
  }

  private candidates(pinned: string | undefined): Endpoint[] {
    const reachable = this.endpoints.filter((e) => !this.unreachable.has(e.region));
    return pinned === undefined ? reachable : reachable.filter((e) => e.region === pinned);
  }

  /** Run `fn` against the first reachable endpoint; fail over on connection errors only. */
  private async withConnection<T>(
    pinned: string | undefined,
    fn: (conn: Conn, region: string) => Promise<T>,
  ): Promise<{ value: T; region: string }> {
    const attempts: Array<{ region: string; error: string }> = [];
    for (const ep of this.candidates(pinned)) {
      let conn: Conn | undefined;
      try {
        conn = await this.connector.connect(ep);
        const value = await fn(conn, ep.region);
        return { value, region: ep.region };
      } catch (e) {
        if (!isConnectionError(e)) throw e; // SQL errors (incl. 40001) bubble to caller/OCC
        attempts.push({ region: ep.region, error: errMessage(e) });
      } finally {
        conn?.release();
      }
    }
    throw new NoEndpointAvailableError(
      pinned === undefined ? 'all endpoints unreachable' : `region ${pinned} unavailable`,
      attempts,
    );
  }

  /** READ — never wrapped in OCC. `region` pins to one endpoint; omit for ordered failover. */
  async read<R = Record<string, unknown>>(
    sql: string,
    params: readonly unknown[] = [],
    opts: { region?: string } = {},
  ): Promise<{ rows: R[]; region: string }> {
    const { value, region } = await this.withConnection(opts.region, async (conn) => {
      const res = await conn.query<R>(sql, params);
      return res.rows;
    });
    return { rows: value, region };
  }

  /** WRITE — wrapped in OCC retry on 40001. `region` pins; omit for ordered failover. */
  async write(
    sql: string,
    params: readonly unknown[] = [],
    opts: { region?: string } = {},
  ): Promise<{ region: string }> {
    const region = await withOccRetry(async () => {
      const r = await this.withConnection(opts.region, async (conn) => {
        await conn.query(sql, params);
      });
      return r.region;
    }, this.options.occ);
    return { region };
  }

  /** Low-level: run `fn` with a pinned connection (used by the migration runner for DDL). */
  async withClient<T>(region: string, fn: (conn: Conn) => Promise<T>): Promise<T> {
    const { value } = await this.withConnection(region, (conn) => fn(conn));
    return value;
  }

  async end(): Promise<void> {
    await this.connector.end();
  }
}
