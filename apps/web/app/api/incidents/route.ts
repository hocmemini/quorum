import { createIncident, listIncidents, ValidationError } from '@quorum/api';
import { getDb } from '@/lib/db';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET() {
  const db = getDb();
  const incidents = await db.run((k) => listIncidents(k, { limit: 50 }));
  return Response.json({ incidents, region: db.current() });
}

export async function POST(req: Request) {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: 'invalid JSON body' }, { status: 400 });
  }
  const { title, severity } = (body ?? {}) as Record<string, unknown>;
  const db = getDb();
  try {
    const result = await db.run((k) =>
      createIncident(k, { title, severity, originRegion: db.current(), actor: 'web' }),
    );
    return Response.json(result, { status: 201 });
  } catch (e) {
    if (e instanceof ValidationError) return Response.json({ error: e.message }, { status: 400 });
    throw e;
  }
}
