import { randomUUID } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { projectIncident } from './incidents';
import type { IncidentEvent } from './schema';

function evt(
  partial: { type: string; payload: Record<string, unknown> } & Partial<IncidentEvent>,
): IncidentEvent {
  return {
    event_id: partial.event_id ?? randomUUID(),
    incident_id: partial.incident_id ?? 'inc-1',
    type: partial.type,
    payload: partial.payload,
    actor: partial.actor ?? null,
    origin_region: partial.origin_region ?? 'us-east-1',
    created_at: partial.created_at ?? new Date(),
  };
}

const t = (s: number): Date => new Date(Date.UTC(2026, 0, 1, 0, 0, s));

describe('projectIncident', () => {
  it('folds opened → note → action → assign → severity → resolve', () => {
    const state = projectIncident('inc-1', [
      evt({
        type: 'incident.opened',
        payload: { title: 'DB down', severity: 'sev1' },
        created_at: t(1),
      }),
      evt({
        type: 'note.added',
        payload: { body: 'investigating' },
        actor: 'alice',
        created_at: t(2),
      }),
      evt({
        type: 'action.created',
        payload: { actionId: 'a1', title: 'failover' },
        created_at: t(3),
      }),
      evt({
        type: 'action.assigned',
        payload: { actionId: 'a1', assignee: 'bob' },
        created_at: t(4),
      }),
      evt({ type: 'severity.changed', payload: { severity: 'sev2' }, created_at: t(5) }),
      evt({ type: 'incident.resolved', payload: {}, created_at: t(6) }),
    ]);
    expect(state.status).toBe('resolved');
    expect(state.title).toBe('DB down');
    expect(state.severity).toBe('sev2');
    expect(state.notes).toEqual([{ at: t(2), actor: 'alice', body: 'investigating' }]);
    expect(state.actions).toEqual([
      { actionId: 'a1', title: 'failover', assignee: 'bob', createdAt: t(3) },
    ]);
    expect(state.openedAt).toEqual(t(1));
    expect(state.resolvedAt).toEqual(t(6));
    expect(state.lastEventAt).toEqual(t(6));
  });

  it('defaults to open on an empty log', () => {
    const state = projectIncident('inc-x', []);
    expect(state.status).toBe('open');
    expect(state.notes).toEqual([]);
    expect(state.actions).toEqual([]);
    expect(state.lastEventAt).toBeNull();
  });

  it('ignores assignment to an unknown action', () => {
    const state = projectIncident('inc-1', [
      evt({ type: 'incident.opened', payload: { title: 't', severity: 'sev3' } }),
      evt({ type: 'action.assigned', payload: { actionId: 'missing', assignee: 'x' } }),
    ]);
    expect(state.actions).toEqual([]);
  });
});
