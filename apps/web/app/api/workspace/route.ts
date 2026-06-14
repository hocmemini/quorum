import { createWorkspace, getWorkspaceByCode } from '@quorum/api';
import { NextResponse } from 'next/server';
import { CHAOS_COOKIE_NAME, ORG_COOKIE_NAME, queryHealthy } from '@/lib/db';
import { checkProvisionRateLimit } from '@/lib/rateLimit';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const COOKIE = { httpOnly: true, sameSite: 'lax', path: '/', maxAge: 60 * 60 * 24 * 30 } as const;

export async function POST(req: Request) {
  let body: { action?: string; name?: string; code?: string };
  try {
    body = (await req.json()) as typeof body;
  } catch {
    return NextResponse.json({ error: 'invalid JSON body' }, { status: 400 });
  }

  // Workspace entry is chaos-immune (DEC-025): a prior drill's chaos cookie must not block creating
  // or joining a workspace, and the entered session starts healthy (clear the chaos cookie).
  if (body.action === 'create') {
    const name = (body.name ?? '').trim().slice(0, 60);
    if (!name) return NextResponse.json({ error: 'name required' }, { status: 400 });
    const limited = await checkProvisionRateLimit(req);
    if (limited)
      return NextResponse.json(
        {
          error: 'Too many new workspaces from your network. Try again shortly.',
          retryAfter: limited.retryAfter,
        },
        { status: 429, headers: { 'retry-after': String(limited.retryAfter) } },
      );
    const ws = await queryHealthy((db) => createWorkspace(db, name));
    const res = NextResponse.json(ws, { status: 201 });
    res.cookies.set(ORG_COOKIE_NAME, ws.orgId, COOKIE);
    res.cookies.delete(CHAOS_COOKIE_NAME);
    return res;
  }

  if (body.action === 'join') {
    const ws = await queryHealthy((db) => getWorkspaceByCode(db, body.code ?? ''));
    if (!ws) return NextResponse.json({ error: 'no workspace with that code' }, { status: 404 });
    const res = NextResponse.json(ws);
    res.cookies.set(ORG_COOKIE_NAME, ws.orgId, COOKIE);
    res.cookies.delete(CHAOS_COOKIE_NAME);
    return res;
  }

  return NextResponse.json({ error: 'unknown action' }, { status: 400 });
}

export async function DELETE() {
  const res = NextResponse.json({ ok: true });
  res.cookies.delete(ORG_COOKIE_NAME);
  return res;
}
