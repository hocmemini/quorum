import type { Pool } from 'pg';
import { createDsqlPool, dsqlConfigFromEnv } from './client';
import { withOccRetry } from './occ';

// DSQL has no TRUNCATE and caps a transaction at 3,000 rows, so we batch-DELETE by primary key.
const BATCH = 2900;

const TABLES: ReadonlyArray<{ table: string; pk: string }> = [
  { table: 'incident_event', pk: 'event_id' },
  { table: 'incident', pk: 'incident_id' },
  { table: 'signal', pk: 'signal_id' },
  { table: 'service', pk: 'service_id' },
  { table: 'spike_event', pk: 'event_id' },
  { table: 'monitor_status', pk: 'snapshot_id' },
];

async function deleteAllRows(pool: Pool, table: string, pk: string): Promise<number> {
  let total = 0;
  for (;;) {
    const res = await withOccRetry(() =>
      pool.query(`DELETE FROM ${table} WHERE ${pk} IN (SELECT ${pk} FROM ${table} LIMIT ${BATCH})`),
    );
    const n = res.rowCount ?? 0;
    total += n;
    if (n === 0) break;
  }
  return total;
}

/**
 * Delete every row from the app + probe tables (batched under the DSQL row-per-transaction limit).
 * Table/column names are a fixed internal list, never user input. A missing table is reported, not
 * fatal, so this is safe to run against a partially-provisioned cluster.
 */
export async function wipeAll(pool: Pool): Promise<Record<string, number>> {
  const deleted: Record<string, number> = {};
  for (const { table, pk } of TABLES) {
    try {
      deleted[table] = await deleteAllRows(pool, table, pk);
    } catch (e) {
      deleted[table] = -1;
      console.error(`wipe: skipped ${table}: ${e instanceof Error ? e.message : String(e)}`);
    }
  }
  return deleted;
}

async function main(): Promise<void> {
  if (process.env.QUORUM_WIPE_CONFIRM !== 'yes' && !process.argv.includes('--yes')) {
    console.error(
      'refusing to wipe without confirmation: set QUORUM_WIPE_CONFIRM=yes or pass --yes',
    );
    process.exit(2);
  }
  const pool = createDsqlPool(dsqlConfigFromEnv());
  try {
    const deleted = await wipeAll(pool);
    console.log(`wiped: ${JSON.stringify(deleted)}`);
  } finally {
    await pool.end();
  }
}

if (process.argv[1] && import.meta.url === `file://${process.argv[1]}`) {
  main().catch((e) => {
    console.error(e);
    process.exit(1);
  });
}
