import { randomUUID } from 'node:crypto';
import {
  addNote,
  assignAction,
  changeSeverity,
  changeStatus,
  createAction,
  type Database,
  deterministicId,
  idempotentWrite,
  openIncident,
  resolveIncident,
} from '@quorum/db';
import type { Kysely } from 'kysely';

export interface WorkspaceInfo {
  orgId: string;
  name: string;
  joinCode: string;
}

function makeJoinCode(): string {
  return randomUUID().replace(/-/g, '').slice(0, 6).toUpperCase();
}

/** Create a workspace and seed it with a few realistic incidents (DEC-016). */
export async function createWorkspace(db: Kysely<Database>, name: string): Promise<WorkspaceInfo> {
  const orgId = randomUUID();
  const joinCode = makeJoinCode();
  await db.insertInto('workspace').values({ org_id: orgId, name, join_code: joinCode }).execute();
  await seedWorkspace(db, orgId);
  return { orgId, name, joinCode };
}

export async function getWorkspaceByCode(
  db: Kysely<Database>,
  code: string,
): Promise<WorkspaceInfo | null> {
  const row = await db
    .selectFrom('workspace')
    .select(['org_id', 'name', 'join_code'])
    .where('join_code', '=', code.trim().toUpperCase())
    .limit(1)
    .executeTakeFirst();
  return row ? { orgId: row.org_id, name: row.name, joinCode: row.join_code } : null;
}

export async function getWorkspace(
  db: Kysely<Database>,
  orgId: string,
): Promise<WorkspaceInfo | null> {
  const row = await db
    .selectFrom('workspace')
    .select(['org_id', 'name', 'join_code'])
    .where('org_id', '=', orgId)
    .limit(1)
    .executeTakeFirst();
  return row ? { orgId: row.org_id, name: row.name, joinCode: row.join_code } : null;
}

/** Ensure the demo workspace row exists (idempotent), then seed it. */
export async function ensureWorkspace(
  db: Kysely<Database>,
  orgId: string,
  name: string,
): Promise<void> {
  const code = orgId.slice(0, 6).toUpperCase();
  await idempotentWrite(async () => {
    await db.insertInto('workspace').values({ org_id: orgId, name, join_code: code }).execute();
  });
  await seedWorkspace(db, orgId);
}

/** Open three realistic incidents with full timelines. Idempotent: deterministic ids per org. */
export async function seedWorkspace(db: Kysely<Database>, orgId: string): Promise<void> {
  const region = 'us-east-1';
  const id = (s: string) => deterministicId(`ws:${orgId}:${s}`);
  const ctx = (actor: string, evt: string) => ({ originRegion: region, actor, eventId: id(evt) });
  const sig = (
    await db.selectFrom('signal').select('signal_id').orderBy('signal_id').limit(3).execute()
  ).map((r) => r.signal_id);
  const alarmSig = await db
    .selectFrom('signal')
    .select(['signal_id', 'name', 'severity'])
    .where('source', '=', 'apigw-5xx')
    .limit(1)
    .executeTakeFirst();

  // i1: 5xx spike, escalated to sev1, then resolved.
  const i1 = id('i1');
  await openIncident(
    db,
    {
      incidentId: i1,
      orgId,
      signalId: sig[0] ?? null,
      title: 'API gateway 5xx spike',
      severity: 'sev2',
    },
    ctx('cloudwatch', 'i1:open'),
  );
  await addNote(
    db,
    i1,
    'Pager fired: 5xx error rate at 12% on api-gateway (us-east-1), well above the 1% SLO.',
    ctx('alice', 'i1:n1'),
  );
  await changeStatus(db, i1, 'acknowledged', ctx('alice', 'i1:ack'));
  await addNote(
    db,
    i1,
    'Onset correlates with deploy api-gateway@4.7.1 ~10 minutes ago. Errors still climbing.',
    ctx('alice', 'i1:n2'),
  );
  await changeSeverity(db, i1, 'sev1', ctx('alice', 'i1:sev'));
  const i1a1 = id('i1:a1');
  await createAction(
    db,
    i1,
    { actionId: i1a1, title: 'Shift read traffic to us-east-2' },
    ctx('alice', 'i1:ac1'),
  );
  await assignAction(db, i1, i1a1, 'bob', ctx('alice', 'i1:as1'));
  await addNote(
    db,
    i1,
    'Traffic shifted to us-east-2; the survivor is absorbing load. Error rate falling 12% -> 4%.',
    ctx('bob', 'i1:n3'),
  );
  const i1a2 = id('i1:a2');
  await createAction(
    db,
    i1,
    { actionId: i1a2, title: 'Roll back api-gateway to 4.7.0' },
    ctx('bob', 'i1:ac2'),
  );
  await assignAction(db, i1, i1a2, 'carol', ctx('bob', 'i1:as2'));
  await addNote(
    db,
    i1,
    'Rollback complete. Root cause: connection-pool exhaustion (pool 20, demand ~60). Back to 0.2%.',
    ctx('carol', 'i1:n4'),
  );
  await resolveIncident(db, i1, ctx('carol', 'i1:res'));

  // i2: auth failures, active sev1.
  const i2 = id('i2');
  await openIncident(
    db,
    {
      incidentId: i2,
      orgId,
      signalId: sig[1] ?? null,
      title: 'Auth token validation failures',
      severity: 'sev1',
    },
    ctx('cloudwatch', 'i2:open'),
  );
  await addNote(
    db,
    i2,
    'auth-service rejecting valid JWTs with 401 (signature mismatch); ~30% of logins failing.',
    ctx('carol', 'i2:n1'),
  );
  await changeStatus(db, i2, 'acknowledged', ctx('carol', 'i2:ack'));
  await addNote(
    db,
    i2,
    'Suspect the JWKS rotation at 14:02 did not propagate to all auth-service pods.',
    ctx('dave', 'i2:n2'),
  );
  const i2a1 = id('i2:a1');
  await createAction(
    db,
    i2,
    { actionId: i2a1, title: 'Force JWKS refresh + rolling restart' },
    ctx('dave', 'i2:ac1'),
  );
  await assignAction(db, i2, i2a1, 'erin', ctx('dave', 'i2:as1'));
  await addNote(
    db,
    i2,
    '18 of 24 pods refreshed and validating tokens; login success recovering 70% -> 92%.',
    ctx('erin', 'i2:n3'),
  );
  // i3: webhook backlog, resolved.
  const i3 = id('i3');
  await openIncident(
    db,
    {
      incidentId: i3,
      orgId,
      signalId: sig[2] ?? null,
      title: 'Payment webhook backlog',
      severity: 'sev3',
    },
    ctx('cloudwatch', 'i3:open'),
  );
  await addNote(
    db,
    i3,
    'Stripe webhook consumer lag at 4,200 messages; settlement confirmations delayed.',
    ctx('bob', 'i3:n1'),
  );
  await changeStatus(db, i3, 'acknowledged', ctx('bob', 'i3:ack'));
  const i3a1 = id('i3:a1');
  await createAction(
    db,
    i3,
    { actionId: i3a1, title: 'Scale webhook consumers 2 -> 6' },
    ctx('bob', 'i3:ac1'),
  );
  await assignAction(db, i3, i3a1, 'alice', ctx('bob', 'i3:as1'));
  await addNote(
    db,
    i3,
    'Scaled to 6 consumers; backlog draining at ~800 msg/min.',
    ctx('alice', 'i3:n2'),
  );
  await addNote(db, i3, 'Backlog cleared, consumer lag back to 0.', ctx('alice', 'i3:n3'));
  await resolveIncident(db, i3, ctx('alice', 'i3:res'));

  // i4: alarm-shaped incident, the same data shape the ingest path produces (DEC-019): a CloudWatch
  // alarm with its opening signal and affected service populated, so every workspace lands with one.
  const i4 = id('i4');
  await openIncident(
    db,
    {
      incidentId: i4,
      orgId,
      signalId: alarmSig?.signal_id ?? sig[0] ?? null,
      title: alarmSig?.name ?? 'API gateway 5xx alarm',
      severity: alarmSig?.severity ?? 'sev2',
    },
    ctx('cloudwatch', 'i4:open'),
  );
  await addNote(
    db,
    i4,
    'CloudWatch alarm apigw-5xx entered ALARM: 5xx error rate above the 1% SLO threshold.',
    ctx('cloudwatch', 'i4:n1'),
  );
}

/** Reset the demo workspace to its seed (clear judge clutter so it does not rot over judging). */
export async function resetDemoWorkspace(db: Kysely<Database>, orgId = 'demo'): Promise<void> {
  const ids = (
    await db.selectFrom('incident').select('incident_id').where('org_id', '=', orgId).execute()
  ).map((r) => r.incident_id);
  if (ids.length > 0) {
    await db.deleteFrom('incident_event').where('incident_id', 'in', ids).execute();
    await db.deleteFrom('incident').where('incident_id', 'in', ids).execute();
  }
  await ensureWorkspace(db, orgId, 'Demo workspace');
}
