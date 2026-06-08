import { ChaosPanel } from '@/components/ChaosPanel';
import { cn } from '@/lib/utils';

type Health = { region: string; up: boolean; latencyMs: number | null };

export function SystemStatus({
  health,
  serving,
  degraded,
  regions,
  down,
}: {
  health: Health[];
  serving: string;
  degraded: boolean;
  regions: string[];
  down: string[];
}) {
  return (
    <section className="mt-5 rounded-lg border border-line bg-surface p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <span className={cn('size-2 rounded-full', degraded ? 'bg-sev2' : 'bg-ok')} />
          <h2 className="text-sm font-semibold">System status</h2>
        </div>
        <span className={cn('font-mono text-xs', degraded ? 'text-sev2' : 'text-muted')}>
          serving {serving}
          {degraded ? ' (failover active)' : ''}
        </span>
      </div>

      <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-3">
        {health.map((h) => (
          <div
            key={h.region}
            className="flex items-center gap-2 rounded-md border border-line bg-bg px-3 py-2 font-mono text-xs"
          >
            <span className={cn('size-2 rounded-full', h.up ? 'bg-ok' : 'bg-sev1')} />
            <span className="text-muted">{h.region}</span>
            <span className={cn('ml-auto', h.up ? 'text-fg' : 'text-sev1')}>
              {h.up ? `${h.latencyMs} ms` : 'down'}
            </span>
          </div>
        ))}
      </div>

      <ChaosPanel regions={regions} down={down} />
    </section>
  );
}
