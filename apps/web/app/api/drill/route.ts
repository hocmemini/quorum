import { createIncident, setStatus } from '@quorum/api';
import { deterministicId } from '@quorum/db';
import { activeOrgId, query } from '@/lib/db';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// Failover-drill incident (DEC-024 Part 0): a drill opens a real, clearly-labeled region-impairment
// incident in the current workspace, written inline on the event-sourced path (NOT via CloudWatch
// ingest). Idempotent per region with the re-ack discipline: open/reactivate on drill, resolve on
// restore, repeated toggles never duplicate. query() applies the chaos cookie, so the record is
// written by the survivor (DEC-023), durable via the witness quorum.
export async function POST(req: Request) {
  const orgId = await activeOrgId();
  if (!orgId) return Response.json({ error: 'no workspace' }, { status: 400 });
  const body = (await req.json().catch(() => ({}))) as { region?: string; action?: string };
  const region = body.region ?? '';
  if (region !== 'us-east-1' && region !== 'us-east-2') {
    return Response.json({ error: 'bad region' }, { status: 400 });
  }
  const incidentId = deterministicId(`drill:${orgId}:${region}`);
  const ctxId = (kind: string) => deterministicId(`drill:${orgId}:${region}:${kind}:${Date.now()}`);

  if (body.action === 'resolve') {
    await query((db) =>
      setStatus(db, {
        incidentId,
        status: 'resolved',
        originRegion: region,
        actor: 'drill',
        eventId: ctxId('resolve'),
      }),
    );
    return Response.json({ ok: true, incidentId, status: 'resolved' });
  }

  // Open / reactivate. The opened event id is deterministic so the incident is created exactly once;
  // setStatus("open") reactivates it if a prior drill had resolved it, and no-ops if already open.
  const sig = await query((db) =>
    db
      .selectFrom('signal')
      .select('signal_id')
      .where('source', '=', `region-health-${region}-drill`)
      .limit(1)
      .executeTakeFirst(),
  );
  await query((db) =>
    createIncident(db, {
      incidentId,
      title: `${region} region impairment (drill)`,
      severity: 'sev1',
      originRegion: region,
      actor: 'drill',
      eventId: deterministicId(`drill:${orgId}:${region}:open`),
      orgId,
      ...(sig ? { signalId: sig.signal_id } : {}),
    }),
  );
  await query((db) =>
    setStatus(db, {
      incidentId,
      status: 'open',
      originRegion: region,
      actor: 'drill',
      eventId: ctxId('reopen'),
    }),
  );
  return Response.json({ ok: true, incidentId, status: 'open' });
}
