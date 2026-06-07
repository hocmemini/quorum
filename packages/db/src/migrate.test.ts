import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { splitStatements } from './migrate';

const dir = fileURLToPath(new URL('../migrations', import.meta.url));
const files = readdirSync(dir)
  .filter((f) => f.endsWith('.sql'))
  .sort();

describe('WP-2 migrations', () => {
  it('contains the four core tables in order', () => {
    expect(files).toEqual([
      '0001_service.sql',
      '0002_signal.sql',
      '0003_incident.sql',
      '0004_incident_event.sql',
    ]);
  });

  it('every statement is a single DDL, indexes are ASYNC, and no foreign keys', () => {
    for (const f of files) {
      const stmts = splitStatements(readFileSync(join(dir, f), 'utf8'));
      expect(stmts.length).toBeGreaterThan(0);
      for (const s of stmts) {
        // one CREATE per statement (one DDL per transaction)
        expect(s.match(/\bCREATE\b/gi)?.length).toBe(1);
        if (/CREATE\s+INDEX/i.test(s)) {
          expect(/CREATE\s+INDEX\s+ASYNC/i.test(s)).toBe(true);
        }
        expect(/FOREIGN\s+KEY|REFERENCES/i.test(s)).toBe(false);
        expect(/\bCREATE\s+SEQUENCE\b/i.test(s)).toBe(false);
      }
    }
  });
});
