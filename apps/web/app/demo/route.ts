import { createWorkspace } from '@quorum/api';
import { NextResponse } from 'next/server';
import { ORG_COOKIE_NAME, query } from '@/lib/db';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// Ephemeral demo provisioning (DEC-024 Part C): /demo is the canonical zero-click front door. It
// provisions a fresh, auto-named, fully-seeded workspace per visitor (DEC-019 seed, incl the
// alarm-shaped incident) and redirects into its war room, so independent judges never collide. The
// old shared 'demo' org (ALARM_ORG_ID) is retained unchanged as the internal live-ingest showcase.
function autoName(): string {
  const id = Math.random().toString(36).slice(2, 6).toUpperCase();
  return `Demo war room ${id}`;
}

export async function GET(req: Request) {
  const ws = await query((db) => createWorkspace(db, autoName()));
  const res = NextResponse.redirect(new URL('/', req.url));
  res.cookies.set(ORG_COOKIE_NAME, ws.orgId, {
    httpOnly: true,
    sameSite: 'lax',
    path: '/',
    maxAge: 60 * 60 * 24 * 30,
  });
  return res;
}
