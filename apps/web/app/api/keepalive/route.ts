import { getDb } from '@/lib/db';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// Warm-up endpoint (DEC-015): a Vercel Cron or external pinger hits this to keep a function instance
// and both region pools warm, so a judge-triggered failover reuses a warm socket (~57 ms) rather
// than paying a cold connect (~595 ms).
export async function GET() {
  const db = getDb();
  const results = await Promise.allSettled(db.pools().map((p) => p.query('SELECT 1')));
  const warmPools = results.filter((r) => r.status === 'fulfilled').length;
  return Response.json({
    ok: true,
    regions: db.regions(),
    warmPools,
    at: new Date().toISOString(),
  });
}
