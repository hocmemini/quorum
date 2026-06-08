import { cookies } from 'next/headers';
import { CHAOS_COOKIE_NAME } from '@/lib/db';

export const runtime = 'nodejs';

// Session-scoped chaos toggle for the live demo: stores the "down" regions in an httpOnly cookie,
// so each visitor's simulated outage affects only their own requests. Non-destructive: active-active
// means the survivor holds the same data.
export async function POST(req: Request) {
  let body: { downRegions?: unknown };
  try {
    body = (await req.json()) as { downRegions?: unknown };
  } catch {
    return Response.json({ error: 'invalid JSON body' }, { status: 400 });
  }
  const regions = Array.isArray(body.downRegions)
    ? body.downRegions.filter((r): r is string => typeof r === 'string')
    : [];

  const jar = await cookies();
  if (regions.length === 0) {
    jar.delete(CHAOS_COOKIE_NAME);
  } else {
    jar.set(CHAOS_COOKIE_NAME, regions.join(','), {
      httpOnly: true,
      sameSite: 'lax',
      path: '/',
      maxAge: 3600,
    });
  }
  return Response.json({ down: regions });
}
