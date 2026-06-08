import { describe, expect, it } from 'vitest';
import { deterministicId } from './ids';
import { CATALOG, serviceId, signalId } from './seed';

describe('seed catalog', () => {
  it('derives unique service and signal ids', () => {
    const svcIds = CATALOG.map((s) => serviceId(s.name));
    expect(new Set(svcIds).size).toBe(svcIds.length);

    const sigIds = CATALOG.flatMap((s) => s.signals.map((sig) => signalId(s.name, sig.name)));
    expect(new Set(sigIds).size).toBe(sigIds.length);
  });

  it('has a non-trivial topology with valid severities', () => {
    expect(CATALOG.length).toBeGreaterThanOrEqual(5);
    for (const svc of CATALOG) {
      expect(svc.signals.length).toBeGreaterThan(0);
      for (const sig of svc.signals) {
        expect(sig.severity).toMatch(/^sev[1-3]$/);
      }
    }
  });
});

describe('deterministicId', () => {
  it('is stable and uuid-shaped', () => {
    expect(deterministicId('x')).toBe(deterministicId('x'));
    expect(deterministicId('a')).not.toBe(deterministicId('b'));
    expect(deterministicId('x')).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/,
    );
  });
});
