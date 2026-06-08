import { getWorkspaceByCode } from '@quorum/api';
import { NextResponse } from 'next/server';
import { ORG_COOKIE_NAME, query } from '@/lib/db';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// Join-by-link (DEC-016): a shared /join/<code> link drops the visitor into that workspace.
export async function GET(req: Request, { params }: { params: Promise<{ code: string }> }) {
  const { code } = await params;
  const ws = await query((db) => getWorkspaceByCode(db, code));
  const res = NextResponse.redirect(new URL('/', req.url));
  if (ws) {
    res.cookies.set(ORG_COOKIE_NAME, ws.orgId, {
      httpOnly: true,
      sameSite: 'lax',
      path: '/',
      maxAge: 60 * 60 * 24 * 30,
    });
  }
  return res;
}
