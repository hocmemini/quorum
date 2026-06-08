import { describe, expect, it } from 'vitest';
import { createFailoverDb, runWithFailover } from './failover';
import { isConnectionError } from './occ';

const connErr = (): Error =>
  Object.assign(new Error('connection terminated'), { code: 'ECONNRESET' });

describe('runWithFailover', () => {
  it('returns the start region on success', async () => {
    let served = -1;
    const r = await runWithFailover([async () => 'a', async () => 'b'], 0, (i) => {
      served = i;
    });
    expect(r).toBe('a');
    expect(served).toBe(0);
  });

  it('fails over to the next region on a connection error', async () => {
    let served = -1;
    const r = await runWithFailover(
      [
        async () => {
          throw connErr();
        },
        async () => 'b',
      ],
      0,
      (i) => {
        served = i;
      },
    );
    expect(r).toBe('b');
    expect(served).toBe(1);
  });

  it('starts at the sticky index and wraps around', async () => {
    let served = -1;
    const r = await runWithFailover(
      [
        async () => 'a',
        async () => {
          throw connErr();
        },
      ],
      1,
      (i) => {
        served = i;
      },
    );
    expect(r).toBe('a');
    expect(served).toBe(0);
  });

  it('throws non-connection errors immediately (no failover)', async () => {
    let calls = 0;
    await expect(
      runWithFailover(
        [
          async () => {
            calls++;
            throw new Error('validation');
          },
          async () => {
            calls++;
            return 'b';
          },
        ],
        0,
        () => {},
      ),
    ).rejects.toThrow('validation');
    expect(calls).toBe(1);
  });

  it('throws when every region has a connection error', async () => {
    await expect(
      runWithFailover(
        [
          async () => {
            throw connErr();
          },
          async () => {
            throw connErr();
          },
        ],
        0,
        () => {},
      ),
    ).rejects.toThrow(/connection/i);
  });
});

describe('isConnectionError', () => {
  it('detects socket and pg connection-class errors', () => {
    expect(isConnectionError(Object.assign(new Error('x'), { code: 'ECONNREFUSED' }))).toBe(true);
    expect(isConnectionError(Object.assign(new Error('x'), { code: '08006' }))).toBe(true);
    expect(isConnectionError(new Error('Connection terminated unexpectedly'))).toBe(true);
  });

  it('ignores serialization and unrelated errors', () => {
    expect(isConnectionError(Object.assign(new Error('x'), { code: '40001' }))).toBe(false);
    expect(isConnectionError(new Error('validation failed'))).toBe(false);
  });
});

describe('createFailoverDb chaos (WP-9)', () => {
  it('fails over away from a region marked down', async () => {
    const db = createFailoverDb(
      [
        { region: 'us-east-1', host: 'primary.invalid' },
        { region: 'us-east-2', host: 'secondary.invalid' },
      ],
      {},
      { downRegions: ['us-east-1'] },
    );
    try {
      const served = await db.run(async () => 'ok');
      expect(served).toBe('ok');
      expect(db.current()).toBe('us-east-2');
    } finally {
      await db.close();
    }
  });

  it('throws when every region is marked down', async () => {
    const db = createFailoverDb(
      [{ region: 'us-east-1', host: 'primary.invalid' }],
      {},
      { downRegions: ['us-east-1'] },
    );
    try {
      await expect(db.run(async () => 'ok')).rejects.toThrow(/down|unavailable/i);
    } finally {
      await db.close();
    }
  });

  it('honors a per-call (request-scoped) downRegions override', async () => {
    const db = createFailoverDb([
      { region: 'us-east-1', host: 'primary.invalid' },
      { region: 'us-east-2', host: 'secondary.invalid' },
    ]);
    try {
      const served = await db.run(async () => 'ok', { downRegions: ['us-east-1'] });
      expect(served).toBe('ok');
      expect(db.current()).toBe('us-east-2');
    } finally {
      await db.close();
    }
  });
});
