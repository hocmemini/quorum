/** A regional DSQL endpoint in the failover pool. */
export interface Endpoint {
  /** AWS region, e.g. `us-east-1`. */
  readonly region: string;
  /** Connection host, e.g. `<id>.dsql.us-east-1.on.aws`. */
  readonly host: string;
}

/** Minimal connection handle - satisfied by the pg client wrapper and by test fakes. */
export interface Conn {
  query<R = Record<string, unknown>>(
    sql: string,
    params?: readonly unknown[],
  ): Promise<{ rows: R[] }>;
  release(): void;
}

/** Opens connections to endpoints. Abstracted so failover logic is testable without AWS. */
export interface Connector {
  connect(endpoint: Endpoint): Promise<Conn>;
  end(): Promise<void>;
}

/** Thrown when every reachable endpoint failed, or none were reachable. */
export class NoEndpointAvailableError extends Error {
  readonly attempts: ReadonlyArray<{ region: string; error: string }>;
  constructor(message: string, attempts: ReadonlyArray<{ region: string; error: string }>) {
    super(message);
    this.name = 'NoEndpointAvailableError';
    this.attempts = attempts;
  }
}
