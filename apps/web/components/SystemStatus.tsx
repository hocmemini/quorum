import { ChaosPanel } from '@/components/ChaosPanel';
import { cn } from '@/lib/utils';

type Health = { region: string; up: boolean; latencyMs: number | null };

export function SystemStatus({
  health,
  serving,
  degraded,
  allDown,
  witness,
  regions,
  down,
}: {
  health: Health[];
  serving: string;
  degraded: boolean;
  allDown: boolean;
  witness: string;
  regions: string[];
  down: string[];
}) {
  // Two serving regions (active-active) + one witness (durability quorum, no query endpoint).
  const rows = [
    ...health.map((h, i) => ({
      region: h.region,
      role: i === 0 ? 'serving (primary)' : 'serving',
      status: h.up ? `${h.latencyMs} ms` : 'down',
      tone: h.up ? 'ok' : 'sev1',
    })),
    { region: witness, role: 'witness (durability)', status: 'quorum', tone: 'accent' },
  ];

  return (
    <section className="mt-5 rounded-lg border border-line bg-surface p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <span className={cn('size-2 rounded-full', degraded ? 'bg-sev2' : 'bg-ok')} />
          <h2 className="text-sm font-semibold">System status</h2>
        </div>
        <span className={cn('font-mono text-xs', degraded ? 'text-sev2' : 'text-muted')}>
          {allDown
            ? 'no serving region (data safe via witness)'
            : `serving ${serving}${degraded ? ' (failover active)' : ''}`}
        </span>
      </div>

      <div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-3">
        {rows.map((r) => (
          <div
            key={r.region}
            className="flex items-center gap-2 rounded-md border border-line bg-bg px-3 py-2 font-mono text-xs"
          >
            <span
              className={cn(
                'size-2 shrink-0 rounded-full',
                r.tone === 'ok' && 'bg-ok',
                r.tone === 'sev1' && 'bg-sev1',
                r.tone === 'accent' && 'bg-accent',
              )}
            />
            <span className="text-fg">{r.region}</span>
            <span className="text-muted">{r.role}</span>
            <span className={cn('ml-auto', r.tone === 'sev1' ? 'text-sev1' : 'text-muted')}>
              {r.status}
            </span>
          </div>
        ))}
      </div>

      <p className="mt-2 text-xs text-muted">
        Active-active across two regions with a witness in {witness}. Losing one region serves from
        the survivor; the witness keeps the quorum durable but does not serve queries.
      </p>

      <ChaosPanel regions={regions} down={down} />
    </section>
  );
}
