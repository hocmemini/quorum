import { randomUUID } from 'node:crypto';
import {
  addNote,
  assignAction,
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

/** Open a few realistic incidents in a workspace. Idempotent: deterministic ids per org. */
export async function seedWorkspace(db: Kysely<Database>, orgId: string): Promise<void> {
  const region = 'us-east-1';
  const id = (s: string) => deterministicId(`ws:${orgId}:${s}`);
  const ctx = (actor: string, evt: string) => ({ originRegion: region, actor, eventId: id(evt) });

  const i1 = id('i1');
  await openIncident(
    db,
    { incidentId: i1, orgId, title: 'API gateway 5xx spike', severity: 'sev2' },
    ctx('cloudwatch', 'i1:open'),
  );
  await addNote(
    db,
    i1,
    'Pager fired on elevated 5xx from api-gateway. On-call investigating.',
    ctx('alice', 'i1:n1'),
  );
  const a1 = id('i1:a1');
  await createAction(
    db,
    i1,
    { actionId: a1, title: 'Shift traffic to us-east-2' },
    ctx('alice', 'i1:ac1'),
  );
  await assignAction(db, i1, a1, 'bob', ctx('alice', 'i1:as1'));
  await changeStatus(db, i1, 'acknowledged', ctx('bob', 'i1:ack'));

  const i2 = id('i2');
  await openIncident(
    db,
    { incidentId: i2, orgId, title: 'Auth token validation errors', severity: 'sev1' },
    ctx('cloudwatch', 'i2:open'),
  );
  await addNote(
    db,
    i2,
    'auth-service returning 401s for valid tokens; rolling back the last deploy.',
    ctx('carol', 'i2:n1'),
  );

  const i3 = id('i3');
  await openIncident(
    db,
    { incidentId: i3, orgId, title: 'Payment webhook backlog', severity: 'sev3' },
    ctx('cloudwatch', 'i3:open'),
  );
  await resolveIncident(db, i3, ctx('dave', 'i3:res'));
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
