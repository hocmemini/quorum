import { createIncident } from '@quorum/api';
import { createDb, type Database, deterministicId } from '@quorum/db';

// EventBridge "CloudWatch Alarm State Change" event (only the fields we use).
interface AlarmEvent {
  source?: string;
  region?: string;
  detail?: {
    alarmName?: string;
    state?: { value?: string; timestamp?: string };
  };
}

export interface ParsedAlarm {
  incidentId: string;
  eventId: string;
  title: string;
  severity: string;
  originRegion: string;
}

/**
 * Pure: map a CloudWatch alarm transition INTO the ALARM state to an idempotent incident.
 * Returns null for events we do not act on (non-cloudwatch source, or not entering ALARM).
 * One incident per alarm name; one opened-event per state-change timestamp, so a re-delivered
 * alarm event dedups on the primary key (DEC-005).
 */
export function parseAlarmEvent(event: AlarmEvent): ParsedAlarm | null {
  if (event.source !== 'aws.cloudwatch') return null;
  const detail = event.detail;
  if (!detail?.alarmName || detail.state?.value !== 'ALARM') return null;
  const alarmName = detail.alarmName;
  const stamp = detail.state?.timestamp ?? '';
  return {
    incidentId: deterministicId(`incident:${alarmName}`),
    eventId: deterministicId(`event:${alarmName}:${stamp}`),
    title: `Alarm: ${alarmName}`,
    severity: 'sev2',
    originRegion: event.region ?? 'us-east-1',
  };
}

function requiredEnv(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`missing env ${name}`);
  return v;
}

/** Lambda entrypoint: on a CloudWatch alarm, idempotently open an incident in DSQL (WP-7). */
export const handler = async (event: AlarmEvent): Promise<{ ok: boolean; incidentId?: string }> => {
  const parsed = parseAlarmEvent(event);
  if (!parsed) return { ok: true };
  const { db, pool } = createDb<Database>({
    host: requiredEnv('DSQL_ENDPOINT_PRIMARY'),
    region: requiredEnv('DSQL_REGION'),
  });
  try {
    await createIncident(db, {
      incidentId: parsed.incidentId,
      eventId: parsed.eventId,
      title: parsed.title,
      severity: parsed.severity,
      originRegion: parsed.originRegion,
      actor: 'cloudwatch',
      // route scripted-alarm ingestion to the shared demo/alarms workspace (DEC-016)
      orgId: process.env.ALARM_ORG_ID ?? 'demo',
    });
    return { ok: true, incidentId: parsed.incidentId };
  } finally {
    await pool.end();
  }
};
