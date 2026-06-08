import { ensureWorkspace } from '@quorum/api';
import { NextResponse } from 'next/server';
import { ORG_COOKIE_NAME, query } from '@/lib/db';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// The always-available demo workspace (DEC-016): preloaded, reset on a schedule by the monitor cron.
export async function GET(req: Request) {
  await query((db) => ensureWorkspace(db, 'demo', 'Demo workspace'));
  const res = NextResponse.redirect(new URL('/', req.url));
  res.cookies.set(ORG_COOKIE_NAME, 'demo', {
    httpOnly: true,
    sameSite: 'lax',
    path: '/',
    maxAge: 60 * 60 * 24 * 30,
  });
  return res;
}
