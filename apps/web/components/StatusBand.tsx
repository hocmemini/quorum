import type { MonitorSnapshot } from '@quorum/db';
import { StatusBandDrillButton } from '@/components/StatusBandDrillButton';
import { cn } from '@/lib/utils';

// Compact control-plane status band on the war room (DEC-024/025): serving region + health, the
// latest consistency-check result, and an in-place drill control (label matches effect). Reads the
// existing DSQL status snapshot on the existing poll cadence; no new claims.
export function StatusBand({
  serving,
  degraded,
  allDown,
  witness,
  down,
  regions,
  snapshot,
}: {
  serving: string;
  degraded: boolean;
  allDown: boolean;
  witness: string;
  down: string[];
  regions: string[];
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
              allDown
                ? 'bg-sev1 text-sev1'
                : degraded
                  ? 'bg-sev2 text-sev2 live-dot'
                  : 'bg-ok text-ok live-dot',
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
      <StatusBandDrillButton serving={serving} down={down} regions={regions} />
    </section>
  );
}
