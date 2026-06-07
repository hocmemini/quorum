import { createHash } from 'node:crypto';
import { readdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import type { Pool } from 'pg';
import { createDsqlPool, dsqlConfigFromEnv } from './client';
import { isUniqueViolation, withOccRetry } from './occ';

/**
 * Split a migration file into individual statements. By contract each statement is a single
 * DDL; authors separate statements with a line containing only `--;`. We do not parse SQL —
 * boundaries are explicit.
 */
export function splitStatements(sql: string): string[] {
  return sql
    .split(/^[ \t]*--;[ \t]*$/m)
    .map((s) => s.trim())
    .filter((s) => s.length > 0 && !/^(?:--.*\r?\n?)+$/.test(s));
}

const MIGRATIONS_TABLE_DDL = `CREATE TABLE IF NOT EXISTS schema_migrations (
  name        text PRIMARY KEY,
  checksum    text NOT NULL,
  applied_at  timestamptz NOT NULL DEFAULT now()
)`;
// Low-cardinality control table: the natural key (name) is the PK, which gives idempotency
// for free (a duplicate insert is a 23505 we treat as success). The UUID-PK rule in
// CLAUDE.md targets high-write tables, where an ordered key would create a hot partition.

/** Run one statement in its own explicit transaction with a single COMMIT (DSQL: 1 DDL/txn). */
async function runOneStatementTxn(pool: Pool, statement: string): Promise<void> {
  await withOccRetry(async () => {
    const client = await pool.connect();
    try {
      await client.query('BEGIN'); // Repeatable Read is the DSQL default — never SET it
      await client.query(statement);
      await client.query('COMMIT');
    } catch (e) {
      await client.query('ROLLBACK').catch(() => undefined);
      throw e;
    } finally {
      client.release();
    }
  });
}

async function recordApplied(pool: Pool, name: string, checksum: string): Promise<void> {
  await withOccRetry(async () => {
    try {
      await pool.query('INSERT INTO schema_migrations (name, checksum) VALUES ($1, $2)', [
        name,
        checksum,
      ]);
    } catch (e) {
      if (isUniqueViolation(e)) return; // already recorded — success
      throw e;
    }
  });
}

/** Apply all pending `*.sql` migrations in `migrationsDir`, in filename order. */
export async function migrate(migrationsDir: string): Promise<{ applied: string[] }> {
  const pool = createDsqlPool(dsqlConfigFromEnv());
  const applied: string[] = [];
  try {
    await runOneStatementTxn(pool, MIGRATIONS_TABLE_DDL);

    const { rows } = await pool.query<{ name: string }>('SELECT name FROM schema_migrations');
    const done = new Set(rows.map((r) => r.name));

    const files = (await readdir(migrationsDir)).filter((f) => f.endsWith('.sql')).sort();

    for (const file of files) {
      if (done.has(file)) continue;
      const sql = await readFile(join(migrationsDir, file), 'utf8');
      const checksum = createHash('sha256').update(sql).digest('hex');
      for (const statement of splitStatements(sql)) {
        await runOneStatementTxn(pool, statement);
      }
      await recordApplied(pool, file, checksum);
      applied.push(file);
    }
    return { applied };
  } finally {
    await pool.end();
  }
}

// CLI: `tsx src/migrate.ts`
const invoked = process.argv[1];
if (invoked !== undefined && import.meta.url === `file://${invoked}`) {
  const dir = process.env.MIGRATIONS_DIR ?? new URL('../migrations', import.meta.url).pathname;
  migrate(dir)
    .then(({ applied }) =>
      console.log(applied.length ? `applied: ${applied.join(', ')}` : 'no pending migrations'),
    )
    .catch((e: unknown) => {
      console.error(e);
      process.exitCode = 1;
    });
}
