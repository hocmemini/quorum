import { describe, expect, it } from 'vitest';
import {
  appendNote,
  assignIncidentAction,
  createIncident,
  readIncident,
  setStatus,
  ValidationError,
} from './service';

// Validation runs before the db is ever touched, so a dummy db is never reached on bad input.
const db = {} as never;

describe('service validation', () => {
  it('rejects empty required fields', async () => {
    await expect(
      createIncident(db, { title: '', severity: 'sev1', originRegion: 'us-east-1' }),
    ).rejects.toBeInstanceOf(ValidationError);
    await expect(
      createIncident(db, { title: 'x', severity: 'sev1', originRegion: '' }),
    ).rejects.toThrow(/originRegion/);
  });

  it('rejects a bad status', async () => {
    await expect(
      setStatus(db, { incidentId: 'i1', status: 'bogus', originRegion: 'us-east-1' }),
    ).rejects.toThrow(/status/);
  });

  it('rejects a non-string optional field', async () => {
    await expect(
      createIncident(db, {
        title: 'x',
        severity: 'sev1',
        originRegion: 'us-east-1',
        actor: 42,
      }),
    ).rejects.toThrow(/actor/);
  });

  it('requires incidentId where needed', async () => {
    await expect(
      appendNote(db, { incidentId: '', body: 'hi', originRegion: 'us-east-1' }),
    ).rejects.toThrow(/incidentId/);
    await expect(
      assignIncidentAction(db, {
        incidentId: 'i1',
        actionId: '',
        assignee: 'a',
        originRegion: 'us-east-1',
      }),
    ).rejects.toThrow(/actionId/);
    await expect(readIncident(db, undefined)).rejects.toThrow(/incidentId/);
  });
});
