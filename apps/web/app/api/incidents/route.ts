import { createIncident, listIncidents, ValidationError } from '@quorum/api';
import { chaosState, query } from '@/lib/db';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET() {
  const incidents = await query((k) => listIncidents(k, { limit: 50 }));
  const { serving } = await chaosState();
  return Response.json({ incidents, region: serving });
}

export async function POST(req: Request) {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: 'invalid JSON body' }, { status: 400 });
  }
  const { title, severity } = (body ?? {}) as Record<string, unknown>;
  const { serving } = await chaosState();
  try {
    const result = await query((k) =>
      createIncident(k, { title, severity, originRegion: serving, actor: 'web' }),
    );
    return Response.json(result, { status: 201 });
  } catch (e) {
    if (e instanceof ValidationError) return Response.json({ error: e.message }, { status: 400 });
    throw e;
  }
}
