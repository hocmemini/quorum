import { createWorkspace } from '@quorum/api';
import { NextResponse } from 'next/server';
import { CHAOS_COOKIE_NAME, ORG_COOKIE_NAME, queryHealthy } from '@/lib/db';
import { checkProvisionRateLimit, provisionThrottledPage } from '@/lib/rateLimit';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// Ephemeral demo provisioning (DEC-024 Part C), chaos-immune (DEC-025): /demo is the zero-click front
// door. It provisions a fresh, auto-named, fully-seeded workspace per visitor and redirects into its
// war room. Provisioning ignores the session chaos cookie (so a prior both-down drill can't brick the
// front door) and clears it, so the fresh workspace starts healthy with no drill bleed-through. The
// shared 'demo' org (ALARM_ORG_ID) is retained unchanged as the internal live-ingest showcase.
function autoName(): string {
  const id = Math.random().toString(36).slice(2, 6).toUpperCase();
  return `Demo war room ${id}`;
}

export async function GET(req: Request) {
  // Provision rate-limit (DEC-027), before any workspace is created. Uses the same chaos-immune
  // healthy path as provisioning, so a drill never breaks it (DEC-025 invariant preserved).
  const limited = await checkProvisionRateLimit(req);
  if (limited) return provisionThrottledPage(limited.retryAfter);
  const ws = await queryHealthy((db) => createWorkspace(db, autoName()));
  const res = NextResponse.redirect(new URL('/', req.url));
  res.cookies.set(ORG_COOKIE_NAME, ws.orgId, {
    httpOnly: true,
    sameSite: 'lax',
    path: '/',
    maxAge: 60 * 60 * 24 * 30,
  });
  res.cookies.delete(CHAOS_COOKIE_NAME);
  return res;
}
