import {
  appendNote,
  assignIncidentAction,
  createIncidentAction,
  resolve,
  setSeverity,
  setStatus,
  ValidationError,
} from '@quorum/api';
import { getDb } from '@/lib/db';

export const runtime = 'nodejs';

export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  let body: Record<string, unknown>;
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    return Response.json({ error: 'invalid JSON body' }, { status: 400 });
  }

  const db = getDb();
  const base = {
    incidentId: id,
    originRegion: db.current(),
    actor: typeof body.actor === 'string' ? body.actor : 'web',
  };

  try {
    const result = await db.run((k) => {
      switch (body.kind) {
        case 'note':
          return appendNote(k, { ...base, body: body.body });
        case 'status':
          return setStatus(k, { ...base, status: body.status });
        case 'severity':
          return setSeverity(k, { ...base, severity: body.severity });
        case 'action':
          return createIncidentAction(k, { ...base, title: body.title });
        case 'assign':
          return assignIncidentAction(k, {
            ...base,
            actionId: body.actionId,
            assignee: body.assignee,
          });
        case 'resolve':
          return resolve(k, { ...base, resolution: body.resolution });
        default:
          throw new ValidationError(`unknown event kind: ${String(body.kind)}`);
      }
    });
    return Response.json(result);
  } catch (e) {
    if (e instanceof ValidationError) return Response.json({ error: e.message }, { status: 400 });
    throw e;
  }
}
