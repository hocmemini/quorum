import { createHash } from 'node:crypto';

/**
 * Deterministic uuid-shaped id from a seed string (sha256). A stable id derived from natural
 * keys is the idempotency key (DEC-005): re-running a seed or re-delivering an event collides on
 * the primary key (SQLSTATE 23505) and is treated as success. sha256 output is uniformly
 * distributed, so these keys also avoid a hot write partition.
 */
export function deterministicId(seed: string): string {
  const h = createHash('sha256').update(seed).digest('hex');
  return [h.slice(0, 8), h.slice(8, 12), h.slice(12, 16), h.slice(16, 20), h.slice(20, 32)].join(
    '-',
  );
}
