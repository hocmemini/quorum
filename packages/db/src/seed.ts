import type { Kysely } from 'kysely';
import { createDb } from './client';
import { idempotentWrite } from './events';
import { deterministicId } from './ids';
import { addNote, assignAction, changeStatus, createAction, openIncident } from './incidents';
import type { Database } from './schema';

interface SeedSignal {
  name: string;
  source: string; // the CloudWatch alarm name that fires it
  severity: string;
}
interface SeedService {
  name: string;
  tier: string;
  signals: SeedSignal[];
}

/**
 * Representative service + signal catalog (the data substrate). A small, realistic multi-tier
 * SaaS topology so a judge sees a populated war room, not an empty shell.
 */
export const CATALOG: SeedService[] = [
  {
    name: 'api-gateway',
    tier: 'tier-1',
    signals: [
      { name: '5xx rate high', source: 'apigw-5xx', severity: 'sev2' },
      { name: 'p99 latency high', source: 'apigw-latency-p99', severity: 'sev3' },
    ],
  },
  {
    name: 'auth-service',
    tier: 'tier-1',
    signals: [
      { name: 'token validation errors', source: 'auth-validation-errors', severity: 'sev1' },
      { name: 'login failure spike', source: 'auth-login-failures', severity: 'sev2' },
    ],
  },
  {
    name: 'payments-service',
    tier: 'tier-1',
    signals: [
      { name: 'charge failure rate', source: 'pay-charge-failures', severity: 'sev1' },
      { name: 'webhook backlog', source: 'pay-webhook-lag', severity: 'sev3' },
    ],
  },
  {
    name: 'orders-service',
    tier: 'tier-2',
    signals: [{ name: 'order creation errors', source: 'orders-create-errors', severity: 'sev2' }],
  },
  {
    name: 'inventory-service',
    tier: 'tier-2',
    signals: [{ name: 'stock sync lag', source: 'inventory-sync-lag', severity: 'sev3' }],
  },
  {
    name: 'search-service',
    tier: 'tier-2',
    signals: [{ name: 'query latency high', source: 'search-latency', severity: 'sev3' }],
  },
  {
    name: 'notifications-service',
    tier: 'tier-3',
    signals: [{ name: 'email send failures', source: 'notify-email-failures', severity: 'sev3' }],
  },
  {
    name: 'database-primary',
    tier: 'tier-1',
    signals: [
      { name: 'replica lag', source: 'db-replica-lag', severity: 'sev2' },
      { name: 'connection saturation', source: 'db-connection-saturation', severity: 'sev1' },
    ],
  },
  {
    // Control plane: the surface a failover drill opens an incident against (DEC-024 Part 0).
    name: 'control-plane',
    tier: 'tier-1',
    signals: [
      {
        name: 'region-health: us-east-1 unreachable (drill)',
        source: 'region-health-us-east-1-drill',
        severity: 'sev1',
      },
      {
        name: 'region-health: us-east-2 unreachable (drill)',
        source: 'region-health-us-east-2-drill',
        severity: 'sev1',
      },
    ],
  },
];

export function serviceId(name: string): string {
  return deterministicId(`service:${name}`);
}
export function signalId(serviceName: string, signalName: string): string {
  return deterministicId(`signal:${serviceName}:${signalName}`);
}

/** Insert the catalog. Idempotent: deterministic ids dedup on re-run (DEC-005). */
export async function seedCatalog(
  db: Kysely<Database>,
): Promise<{ services: number; signals: number }> {
  let services = 0;
  let signals = 0;
  for (const svc of CATALOG) {
    const sid = serviceId(svc.name);
    await idempotentWrite(async () => {
      await db
        .insertInto('service')
        .values({ service_id: sid, name: svc.name, tier: svc.tier, metadata: JSON.stringify({}) })
        .execute();
    });
    services++;
    for (const sig of svc.signals) {
      const sigId = signalId(svc.name, sig.name);
      await idempotentWrite(async () => {
        await db
          .insertInto('signal')
          .values({
            signal_id: sigId,
            service_id: sid,
            name: sig.name,
            source: sig.source,
            severity: sig.severity,
            metadata: JSON.stringify({}),
          })
          .execute();
      });
      signals++;
    }
  }
  return { services, signals };
}

/** Open one rich demo incident through the domain API. Idempotent (deterministic event ids). */
export async function seedDemoIncident(db: Kysely<Database>): Promise<{ incidentId: string }> {
  const base = { originRegion: 'us-east-1' as const };
  const incidentId = deterministicId('incident:demo-1');
  const ev = (suffix: string) => deterministicId(`event:demo-1:${suffix}`);

  await openIncident(
    db,
    {
      incidentId,
      signalId: signalId('api-gateway', '5xx rate high'),
      title: 'API gateway 5xx spike',
      severity: 'sev2',
    },
    { ...base, actor: 'cloudwatch', eventId: ev('open') },
  );
  await addNote(
    db,
    incidentId,
    'Pager fired on elevated 5xx from api-gateway. On-call investigating.',
    { ...base, actor: 'alice', eventId: ev('note-1') },
  );
  const actionId = deterministicId('action:demo-1:shift-traffic');
  await createAction(
    db,
    incidentId,
    { actionId, title: 'Shift traffic to us-east-2' },
    { ...base, actor: 'alice', eventId: ev('action-1') },
  );
  await assignAction(db, incidentId, actionId, 'bob', {
    ...base,
    actor: 'alice',
    eventId: ev('assign-1'),
  });
  await changeStatus(db, incidentId, 'acknowledged', {
    ...base,
    actor: 'bob',
    eventId: ev('ack'),
  });
  return { incidentId };
}

export async function seedAll(
  db: Kysely<Database>,
): Promise<{ services: number; signals: number; incidentId: string }> {
  const catalog = await seedCatalog(db);
  const { incidentId } = await seedDemoIncident(db);
  return { ...catalog, incidentId };
}

function requireEnv(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`missing env ${name}`);
  return v;
}

// CLI: AWS_PROFILE=h0 DSQL_ENDPOINT_PRIMARY=<host> DSQL_REGION=<region> pnpm --filter @quorum/db seed
async function main(): Promise<void> {
  const { db, pool } = createDb<Database>({
    host: requireEnv('DSQL_ENDPOINT_PRIMARY'),
    region: requireEnv('DSQL_REGION'),
  });
  try {
    const r = await seedAll(db);
    console.log(
      `seeded ${r.services} services, ${r.signals} signals, demo incident ${r.incidentId}`,
    );
  } finally {
    await pool.end();
  }
}

if (process.argv[1] && import.meta.url === `file://${process.argv[1]}`) {
  main().catch((e) => {
    console.error(e);
    process.exit(1);
  });
}
