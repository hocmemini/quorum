import { describe, expect, it } from 'vitest';
import { handler, parseAlarmEvent } from './handler';

const alarmEvent = {
  source: 'aws.cloudwatch',
  region: 'us-east-1',
  detail: {
    alarmName: 'db-cpu-high',
    state: { value: 'ALARM', timestamp: '2026-06-07T00:00:00Z' },
  },
};

describe('parseAlarmEvent', () => {
  it('maps an ALARM transition to an incident', () => {
    const p = parseAlarmEvent(alarmEvent);
    expect(p).not.toBeNull();
    expect(p?.title).toContain('db-cpu-high');
    expect(p?.originRegion).toBe('us-east-1');
    expect(p?.incidentId).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-/);
  });

  it('is deterministic (idempotency keys are stable for the same event)', () => {
    expect(parseAlarmEvent(alarmEvent)).toEqual(parseAlarmEvent(alarmEvent));
  });

  it('keys one incident per alarm, one event per state-change timestamp', () => {
    const a = parseAlarmEvent(alarmEvent);
    const later = parseAlarmEvent({
      ...alarmEvent,
      detail: {
        alarmName: 'db-cpu-high',
        state: { value: 'ALARM', timestamp: '2026-06-07T01:00:00Z' },
      },
    });
    expect(a?.incidentId).toBe(later?.incidentId);
    expect(a?.eventId).not.toBe(later?.eventId);
  });

  it('ignores non-ALARM states and non-cloudwatch sources', () => {
    expect(
      parseAlarmEvent({ ...alarmEvent, detail: { alarmName: 'x', state: { value: 'OK' } } }),
    ).toBeNull();
    expect(parseAlarmEvent({ ...alarmEvent, source: 'aws.other' })).toBeNull();
  });
});

// Live ingestion smoke (WP-11). Gated on a real DSQL endpoint; runs at go-live.
const LIVE = !!process.env.DSQL_ENDPOINT_PRIMARY;

describe.skipIf(!LIVE)('handler integration (live DSQL)', () => {
  it('opens an incident from a CloudWatch alarm event', async () => {
    const res = await handler({
      source: 'aws.cloudwatch',
      region: process.env.DSQL_REGION ?? 'us-east-1',
      detail: {
        alarmName: `smoke-${Date.now()}`,
        state: { value: 'ALARM', timestamp: new Date().toISOString() },
      },
    });
    expect(res.ok).toBe(true);
    expect(res.incidentId).toBeTruthy();
  }, 60_000);
});
