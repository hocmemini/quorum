import { createHash } from 'node:crypto';
import { readdir, readFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { FailoverClient } from './failover-client';

const MIGRATIONS_TABLE = `CREATE TABLE IF NOT EXISTS spike_schema_migrations (
  name        text PRIMARY KEY,
  checksum    text NOT NULL,
  applied_at  timestamptz NOT NULL DEFAULT now()
)`;

/** Split a migration file on lines containing only `--;` (one DDL statement per chunk). */
export function splitStatements(sql: string): string[] {
  return sql
    .split(/^[ \t]*--;[ \t]*$/m)
    .map((s) => s.trim())
    .filter((s) => s.length > 0 && !/^(?:--.*\r?\n?)+$/.test(s));
}

/** Run one DDL statement in its own explicit transaction with a single COMMIT (DSQL rule). */
async function runDdl(client: FailoverClient, region: string, statement: string): Promise<void> {
  await client.withClient(region, async (conn) => {
    await conn.query('BEGIN'); // Repeatable Read is the DSQL default — never SET it
    try {
      await conn.query(statement);
      await conn.query('COMMIT');
    } catch (e) {
      await conn.query('ROLLBACK').catch(() => undefined);
      throw e;
    }
  });
}

function defaultMigrationsDir(): string {
  return join(dirname(fileURLToPath(import.meta.url)), '..', 'migrations');
}

/** Apply pending `*.sql` migrations (filename order) on the primary region. */
export async function migrate(
  client: FailoverClient,
  migrationsDir: string = defaultMigrationsDir(),
): Promise<string[]> {
  const region = client.regions()[0];
  if (region === undefined) throw new Error('no endpoints configured');

  await runDdl(client, region, MIGRATIONS_TABLE);
  const { rows } = await client.read<{ name: string }>(
    'SELECT name FROM spike_schema_migrations',
    [],
    { region },
  );
  const done = new Set(rows.map((r) => r.name));

  const files = (await readdir(migrationsDir)).filter((f) => f.endsWith('.sql')).sort();
  const applied: string[] = [];
  for (const file of files) {
    if (done.has(file)) continue;
    const sql = await readFile(join(migrationsDir, file), 'utf8');
    const checksum = createHash('sha256').update(sql).digest('hex');
    for (const stmt of splitStatements(sql)) {
      await runDdl(client, region, stmt);
    }
    try {
      await client.write(
        'INSERT INTO spike_schema_migrations (name, checksum) VALUES ($1, $2)',
        [file, checksum],
        { region },
      );
    } catch (e) {
      // duplicate key = already recorded = success (idempotent)
      if (!(typeof e === 'object' && e !== null && (e as { code?: unknown }).code === '23505')) {
        throw e;
      }
    }
    applied.push(file);
  }
  return applied;
}
