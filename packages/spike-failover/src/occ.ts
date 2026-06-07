/** SQLSTATE for a serialization failure (DSQL write conflict). */
export const SERIALIZATION_FAILURE = '40001';

export interface OccOptions {
  maxAttempts?: number;
  baseDelayMs?: number;
  maxDelayMs?: number;
  /** Invoked before each retry sleep (instrumentation / tests). */
  onRetry?: (attempt: number, delayMs: number) => void;
}

export function isSerializationFailure(e: unknown): boolean {
  return (
    typeof e === 'object' && e !== null && (e as { code?: unknown }).code === SERIALIZATION_FAILURE
  );
}

const sleep = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Optimistic concurrency control: retry a WRITE on SQLSTATE 40001 with exponential backoff +
 * full jitter. DSQL reads never conflict - never wrap them (see CLAUDE.md).
 */
export async function withOccRetry<T>(fn: () => Promise<T>, opts: OccOptions = {}): Promise<T> {
  const maxAttempts = opts.maxAttempts ?? 10;
  const baseDelayMs = opts.baseDelayMs ?? 20;
  const maxDelayMs = opts.maxDelayMs ?? 2000;
  let attempt = 0;
  for (;;) {
    try {
      return await fn();
    } catch (e) {
      attempt += 1;
      if (!isSerializationFailure(e) || attempt >= maxAttempts) throw e;
      const ceiling = Math.min(maxDelayMs, baseDelayMs * 2 ** (attempt - 1));
      const delay = Math.random() * ceiling; // full jitter
      opts.onRetry?.(attempt, delay);
      await sleep(delay);
    }
  }
}
