import { resetDemoWorkspace } from '@quorum/api';
import { NextResponse } from 'next/server';
import { query } from '@/lib/db';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// Daily reset of the demo workspace (DEC-016) so it does not rot over the judging window. Vercel
// Cron sends `Authorization: Bearer $CRON_SECRET` when CRON_SECRET is set; we enforce it if present.
export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET;
  if (secret && req.headers.get('authorization') !== `Bearer ${secret}`) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }
  await query((db) => resetDemoWorkspace(db));
  return NextResponse.json({ ok: true, at: new Date().toISOString() });
}
