import type { MonitorSnapshot } from '@quorum/db';
import { ArchDiagram } from '@/components/ArchDiagram';
import { ChaosPanel } from '@/components/ChaosPanel';
import { ProofControls } from '@/components/ProofControls';
import { TryThis } from '@/components/TryThis';
import { cn } from '@/lib/utils';

type Health = { region: string; up: boolean; latencyMs: number | null };

export function ControlPlanePanel({
  snapshot,
  serving,
  degraded,
  allDown,
  witness,
  down,
  regions,
  health,
}: {
  snapshot: MonitorSnapshot | null;
  serving: string;
  degraded: boolean;
  allDown: boolean;
  witness: string;
  down: string[];
  regions: string[];
  health: Health[];
}) {
  const readOf = (r: string) => health.find((h) => h.region === r)?.latencyMs ?? null;
  const cost = snapshot?.cost;

  return (
    <section className="mt-5 rounded-lg border border-line bg-surface p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <span className={cn('size-2 rounded-full', degraded ? 'bg-sev2' : 'bg-ok')} />
          <h2 className="text-sm font-semibold">Control plane</h2>
        </div>
        <span className={cn('font-mono text-xs', degraded ? 'text-sev2' : 'text-ok')}>
          {allDown
            ? 'no serving region (data safe via witness)'
            : `serving ${serving}${degraded ? ' · failover active' : ''}`}
        </span>
      </div>

      <ArchDiagram serving={serving} down={down} regions={regions} witness={witness} />

      <div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-3">
        {regions.map((r) => {
          const isDown = down.includes(r);
          const isServing = r === serving && !isDown;
          const read = readOf(r);
          return (
            <div
              key={r}
              className={cn(
                'rounded-md border bg-bg p-3',
                isDown ? 'border-sev1/50' : isServing ? 'border-ok/50' : 'border-line',
              )}
            >
              <div className="flex items-center justify-between">
                <span className="font-mono text-xs text-fg">{r}</span>
                <span
                  className={cn(
                    'rounded px-1.5 py-0.5 font-mono text-[10px] uppercase',
                    isDown
                      ? 'bg-sev1/15 text-sev1'
                      : isServing
                        ? 'bg-ok/15 text-ok'
                        : 'bg-line/40 text-muted',
                  )}
                >
                  {isDown ? 'down' : isServing ? 'serving' : 'standby'}
                </span>
              </div>
              <div className="mt-2 font-mono text-xs text-muted">
                {isDown ? 'unreachable' : `read ${read ?? '?'} ms · pool warm`}
              </div>
            </div>
          );
        })}
        <div className="rounded-md border border-accent/40 bg-bg p-3">
          <div className="flex items-center justify-between">
            <span className="font-mono text-xs text-fg">{witness}</span>
            <span className="rounded bg-accent/15 px-1.5 py-0.5 font-mono text-[10px] uppercase text-accent">
              witness
            </span>
          </div>
          <div className="mt-2 font-mono text-xs text-muted">durability quorum · non-serving</div>
        </div>
      </div>

      <ProofControls
        initWriteMs={snapshot?.writeP50Ms ?? null}
        initCrossMs={snapshot?.consistency?.crossRegionMs ?? null}
      />

      <p className="mt-3 font-mono text-xs text-muted">
        {cost
          ? `$${cost.monthToDate.toFixed(2)} this month · ${cost.dpuMonth >= 1000 ? `${(cost.dpuMonth / 1000).toFixed(1)}K` : cost.dpuMonth} of 100K free DPU · scale-to-zero`
          : 'scales to zero when idle'}
      </p>

      <TryThis />

      <ChaosPanel regions={regions} down={down} />

      <p className="mt-3 border-t border-line pt-2 text-xs text-muted">
        Deep per-service metrics live in your Grafana or Datadog. Quorum is the coordination plane
        that outlives the region they run in.
      </p>
    </section>
  );
}
