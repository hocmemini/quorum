import { describe, expect, it } from 'vitest';
import { isSerializationFailure, isUniqueViolation, withOccRetry } from './occ';

function pgErr(code: string): Error {
  return Object.assign(new Error(code), { code });
}

describe('withOccRetry', () => {
  it('retries on 40001 then succeeds', async () => {
    let calls = 0;
    const out = await withOccRetry(
      async () => {
        calls += 1;
        if (calls < 3) throw pgErr('40001');
        return 'ok';
      },
      { baseDelayMs: 0, maxDelayMs: 0 },
    );
    expect(out).toBe('ok');
    expect(calls).toBe(3);
  });

  it('does not retry non-serialization errors', async () => {
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
        { maxAttempts: 3, baseDelayMs: 0, maxDelayMs: 0 },
      ),
    ).rejects.toMatchObject({ code: '40001' });
    expect(calls).toBe(3);
  });

  it('classifies pg error codes', () => {
    expect(isSerializationFailure(pgErr('40001'))).toBe(true);
    expect(isUniqueViolation(pgErr('23505'))).toBe(true);
    expect(isUniqueViolation(pgErr('40001'))).toBe(false);
    expect(isSerializationFailure(new Error('x'))).toBe(false);
  });
});
