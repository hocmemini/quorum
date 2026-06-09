import { getDb, query } from '@/lib/db';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// Measured failover (DEC-020): with the chaos cookie marking a region down, time how long the
// session takes to first serve a real query from the survivor. query() applies the session's
// down-regions, so run() serves from the survivor and current() reports which region answered.
export async function POST() {
  const t = performance.now();
  try {
    await query((k) => k.selectFrom('service').select('service_id').limit(1).execute());
  } catch {
    return Response.json({ error: 'no serving region' }, { status: 503 });
  }
  const failoverMs = Math.round((performance.now() - t) * 10) / 10;
  return Response.json({ failoverMs, served: getDb().current() });
}
