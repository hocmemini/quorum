import { describe, expect, it } from 'vitest';
import { isSerializationFailure, withOccRetry } from './occ';

function pgErr(code: string): Error {
  return Object.assign(new Error(code), { code });
}

describe('withOccRetry', () => {
  it('retries on 40001 and eventually succeeds', async () => {
    let calls = 0;
    const retried: number[] = [];
    const result = await withOccRetry(
      async () => {
        calls += 1;
        if (calls < 3) throw pgErr('40001');
        return 'ok';
      },
      { baseDelayMs: 0, maxDelayMs: 0, onRetry: (a) => retried.push(a) },
    );
    expect(result).toBe('ok');
    expect(calls).toBe(3);
    expect(retried).toEqual([1, 2]);
  });

  it('does not retry a non-serialization error', async () => {
    let calls = 0;
    await expect(
      withOccRetry(async () => {
        calls += 1;
        throw pgErr('23505');
      }),
    ).rejects.toMatchObject({ code: '23505' });
    expect(calls).toBe(1);
  });

  it('gives up after maxAttempts', async () => {
    let calls = 0;
    await expect(
      withOccRetry(
        async () => {
          calls += 1;
          throw pgErr('40001');
        },
        { maxAttempts: 4, baseDelayMs: 0, maxDelayMs: 0 },
      ),
    ).rejects.toMatchObject({ code: '40001' });
    expect(calls).toBe(4);
  });

  it('detects serialization failures', () => {
    expect(isSerializationFailure(pgErr('40001'))).toBe(true);
    expect(isSerializationFailure(pgErr('23505'))).toBe(false);
    expect(isSerializationFailure(new Error('x'))).toBe(false);
  });
});
