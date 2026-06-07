import { describe, expect, it } from 'vitest';
import { FailoverClient } from './failover-client';
import type { Conn, Connector, Endpoint } from './types';
import { NoEndpointAvailableError } from './types';

const endpoints: Endpoint[] = [
  { region: 'us-east-1', host: 'h1' },
  { region: 'us-east-2', host: 'h2' },
];

function pgErr(code: string): Error {
  return Object.assign(new Error(code), { code });
}

/** Fake connection whose query returns `rows(sql)`; throwing inside rejects the query. */
function conn(rows: (sql: string) => unknown[]): Conn {
  return {
    query: async <R>(sql: string) => ({ rows: rows(sql) as R[] }),
    release: () => {},
  };
}

describe('FailoverClient', () => {
  it('reads from the first reachable endpoint', async () => {
    const opened: string[] = [];
    const connector: Connector = {
      connect: async (ep) => {
        opened.push(ep.region);
        return conn(() => (ep.region === 'us-east-1' ? [{ event_id: 'x' }] : []));
      },
      end: async () => {},
    };
    const { rows, region } = await new FailoverClient(endpoints, connector).read('SELECT 1');
    expect(region).toBe('us-east-1');
    expect(rows).toHaveLength(1);
    expect(opened).toEqual(['us-east-1']);
  });

  it('fails over to the next endpoint on a connection error', async () => {
    const opened: string[] = [];
    const connector: Connector = {
      connect: async (ep) => {
        if (ep.region === 'us-east-1') throw pgErr('ETIMEDOUT');
        opened.push(ep.region);
        return conn(() => []);
      },
      end: async () => {},
    };
    const { region } = await new FailoverClient(endpoints, connector).read('SELECT 1');
    expect(region).toBe('us-east-2');
    expect(opened).toEqual(['us-east-2']);
  });

  it('skips an endpoint marked unreachable', async () => {
    const opened: string[] = [];
    const connector: Connector = {
      connect: async (ep) => {
        opened.push(ep.region);
        return conn(() => []);
      },
      end: async () => {},
    };
    const client = new FailoverClient(endpoints, connector);
    client.markUnreachable('us-east-1');
    const { region } = await client.read('SELECT 1');
    expect(region).toBe('us-east-2');
    expect(opened).toEqual(['us-east-2']);
  });

  it('throws NoEndpointAvailableError when all are down', async () => {
    const connector: Connector = {
      connect: async () => {
        throw pgErr('ECONNREFUSED');
      },
      end: async () => {},
    };
    await expect(new FailoverClient(endpoints, connector).read('SELECT 1')).rejects.toBeInstanceOf(
      NoEndpointAvailableError,
    );
  });

  it('does not fail over on a SQL error; OCC retries 40001 on writes', async () => {
    let attempts = 0;
    const connector: Connector = {
      connect: async () =>
        conn((sql) => {
          if (sql.startsWith('INSERT')) {
            attempts += 1;
            if (attempts < 3) throw pgErr('40001');
          }
          return [];
        }),
      end: async () => {},
    };
    const client = new FailoverClient(endpoints, connector, {
      occ: { baseDelayMs: 0, maxDelayMs: 0 },
    });
    const { region } = await client.write('INSERT INTO t VALUES (1)');
    expect(region).toBe('us-east-1'); // stayed on primary — 40001 is not a failover trigger
    expect(attempts).toBe(3);
  });

  it('pins reads to a specific region', async () => {
    const opened: string[] = [];
    const connector: Connector = {
      connect: async (ep) => {
        opened.push(ep.region);
        return conn(() => (ep.region === 'us-east-2' ? [{ event_id: 'y' }] : []));
      },
      end: async () => {},
    };
    const { region, rows } = await new FailoverClient(endpoints, connector).read('SELECT 1', [], {
      region: 'us-east-2',
    });
    expect(region).toBe('us-east-2');
    expect(rows).toHaveLength(1);
    expect(opened).toEqual(['us-east-2']);
  });
});
