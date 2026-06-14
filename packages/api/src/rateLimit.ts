import { randomUUID } from 'node:crypto';
import type { Database } from '@quorum/db';
import type { Kysely } from 'kysely';

// Provision rate-limiting (DEC-027): a sliding-window count of provision attempts per client-IP
// hash, in a dedicated table separate from the incident event log. Append-only (no hot-row update,
// OCC-safe); the monitor prunes rows older than 24h. A soft abuse-mitigation control, not a hard
// security boundary - count-then-insert is intentionally not atomic.

/** Count attempts from one IP-hash since `since` (per-IP sliding window). */
export async function countProvisionAttempts(
  db: Kysely<Database>,
  ipHash: string,
  since: Date,
): Promise<number> {
  const row = await db
    .selectFrom('rate_limit')
    .select((eb) => eb.fn.countAll().as('n'))
    .where('ip_hash', '=', ipHash)
    .where('created_at', '>', since)
    .executeTakeFirst();
  return Number(row?.n ?? 0);
}

/** Count all attempts since `since` (generous global backstop; off unless configured). */
export async function countAllProvisionAttempts(
  db: Kysely<Database>,
  since: Date,
): Promise<number> {
  const row = await db
    .selectFrom('rate_limit')
    .select((eb) => eb.fn.countAll().as('n'))
    .where('created_at', '>', since)
    .executeTakeFirst();
  return Number(row?.n ?? 0);
}

/** Append one attempt (no update; OCC-safe). `created_at` defaults to now(). */
export async function recordProvisionAttempt(db: Kysely<Database>, ipHash: string): Promise<void> {
  await db.insertInto('rate_limit').values({ id: randomUUID(), ip_hash: ipHash }).execute();
}
