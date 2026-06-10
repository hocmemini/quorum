import type { MonitorSnapshot } from '@quorum/db';
import Link from 'next/link';
import { cn } from '@/lib/utils';

// Compact control-plane status band on the war room (DEC-024 Part A): serving region + health, the
// latest consistency-check result, and a link into the Reliability surface to run a drill. Reads the
// existing DSQL status snapshot on the existing poll cadence; no new claims.
export function StatusBand({
  serving,
  degraded,
  allDown,
  witness,
  snapshot,
}: {
  serving: string;
  degraded: boolean;
  allDown: boolean;
  witness: string;
  snapshot: MonitorSnapshot | null;
}) {
  const consistency = snapshot?.consistency;
  return (
    <section className="mt-4 flex flex-wrap items-center justify-between gap-3 rounded-lg border border-line bg-surface px-4 py-2.5">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 font-mono text-xs">
        <span className="flex items-center gap-1.5">
          <span
            className={cn(
              'size-2 rounded-full',
              allDown ? 'bg-sev1' : degraded ? 'bg-sev2' : 'bg-ok',
            )}
          />
          <span className={cn(degraded ? 'text-sev2' : 'text-fg')}>
            {allDown
              ? 'no serving region (data safe via witness)'
              : `serving ${serving}${degraded ? ' · failover active' : ''}`}
          </span>
        </span>
        {consistency ? (
          <span className="flex items-center gap-1.5 text-muted">
            <span className={cn('size-1.5 rounded-full', consistency.pass ? 'bg-ok' : 'bg-sev1')} />
            consistency {consistency.crossRegionMs} ms
          </span>
        ) : null}
        <span className="text-muted">witness {witness}</span>
      </div>
      <Link
        href="/reliability"
        className="rounded-md border border-accent/50 bg-accent/10 px-2.5 py-1 font-mono text-xs text-accent hover:bg-accent/20"
      >
        Run a failover drill
      </Link>
    </section>
  );
}
