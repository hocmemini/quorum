/** SQLSTATE codes (see CLAUDE.md). */
export const SERIALIZATION_FAILURE = '40001';
export const UNIQUE_VIOLATION = '23505';

export interface OccOptions {
  maxAttempts?: number;
  baseDelayMs?: number;
  maxDelayMs?: number;
  /** Invoked before each retry sleep (instrumentation / tests). */
  onRetry?: (attempt: number, delayMs: number) => void;
}

function pgCode(e: unknown): string | undefined {
  if (typeof e !== 'object' || e === null) return undefined;
  const code = (e as { code?: unknown }).code;
  return typeof code === 'string' ? code : undefined;
}

export function isSerializationFailure(e: unknown): boolean {
  return pgCode(e) === SERIALIZATION_FAILURE;
}

export function isUniqueViolation(e: unknown): boolean {
  return pgCode(e) === UNIQUE_VIOLATION;
}

/** Socket errors, the pg connection-exception class (08...), and server shutdown (57P...). */
const CONNECTION_ERROR_CODES = new Set([
  'ECONNREFUSED',
  'ECONNRESET',
  'ETIMEDOUT',
  'ENOTFOUND',
  'EHOSTUNREACH',
  'EPIPE',
  '08000',
  '08001',
  '08003',
  '08004',
  '08006',
  '08007',
  '57P01',
  '57P02',
  '57P03',
]);

/**
 * A connection-level failure that should trigger a REGION failover (not an OCC retry): socket
 * errors (ECONN*, timeouts, DNS), the pg connection-exception SQLSTATE class (08...), and server
 * shutdown (57P...). The app failover layer uses this to move to another region.
 */
export function isConnectionError(e: unknown): boolean {
  const code = pgCode(e);
  if (code && CONNECTION_ERROR_CODES.has(code)) return true;
  const msg = e instanceof Error ? e.message.toLowerCase() : '';
  return /connection terminated|connection timeout|timeout expired|econnreset|econnrefused|etimedout|enotfound|ehostunreach|server closed the connection|socket hang up/.test(
    msg,
  );
}

const sleep = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Optimistic concurrency control: retry a WRITE on SQLSTATE 40001 with exponential backoff +
 * full jitter. DSQL reads never conflict - never wrap them (CLAUDE.md).
 */
export async function withOccRetry<T>(fn: () => Promise<T>, opts: OccOptions = {}): Promise<T> {
  const maxAttempts = opts.maxAttempts ?? 10;
  const baseDelayMs = opts.baseDelayMs ?? 25;
  const maxDelayMs = opts.maxDelayMs ?? 2000;
  let attempt = 0;
  for (;;) {
    try {
      return await fn();
    } catch (e) {
      attempt += 1;
      if (!isSerializationFailure(e) || attempt >= maxAttempts) throw e;
      const ceiling = Math.min(maxDelayMs, baseDelayMs * 2 ** (attempt - 1));
      const delay = Math.random() * ceiling;
      opts.onRetry?.(attempt, delay);
      await sleep(delay);
    }
  }
}
