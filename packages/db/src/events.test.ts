import { describe, expect, it } from 'vitest';
import { idempotentWrite } from './events';

function pgErr(code: string): Error {
  return Object.assign(new Error(code), { code });
}

describe('idempotentWrite', () => {
  it('inserts when new (deduped=false)', async () => {
    expect(await idempotentWrite(async () => undefined)).toEqual({ deduped: false });
  });

  it('treats a duplicate key (23505) as success (deduped=true)', async () => {
    const result = await idempotentWrite(async () => {
      throw pgErr('23505');
    });
    expect(result).toEqual({ deduped: true });
  });

  it('retries on 40001 then succeeds', async () => {
    let calls = 0;
    const result = await idempotentWrite(async () => {
      calls += 1;
      if (calls < 2) throw pgErr('40001');
    });
    expect(result).toEqual({ deduped: false });
    expect(calls).toBe(2);
  });

  it('rethrows other errors', async () => {
    await expect(
      idempotentWrite(async () => {
        throw pgErr('23502'); // not_null_violation
      }),
    ).rejects.toMatchObject({ code: '23502' });
  });
});
