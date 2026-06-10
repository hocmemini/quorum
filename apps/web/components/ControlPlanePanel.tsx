import type { MonitorSnapshot } from '@quorum/db';
import { ArchDiagram } from '@/components/ArchDiagram';
import { ChaosPanel } from '@/components/ChaosPanel';
import { RaceProof } from '@/components/RaceProof';
import { VerificationProofs } from '@/components/VerificationProofs';
import { cn } from '@/lib/utils';

type Health = { region: string; up: boolean; latencyMs: number | null };

// The Reliability apparatus, organized as a designed arc (DEC-025): state, verification, contention,
// drills, usage, under visible product section headers with anchor ids. Reorder + headers only - the
// proof logic, endpoints, claims, and measured numbers are unchanged.
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
  const dpu = cost
    ? cost.dpuMonth >= 1000
      ? `${(cost.dpuMonth / 1000).toFixed(1)}K`
      : `${cost.dpuMonth}`
    : null;
  const card = 'rounded-lg border border-line bg-surface p-4';
  const head = 'text-sm font-semibold';

  return (
    <div className="mt-5 space-y-4">
      {/* a. Control plane: the live diagram and region tiles as one state zone. */}
      <section id="control-plane" className={card}>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className={head}>Control plane</h2>
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
          <div className="rounded-md border border-witness/40 bg-bg p-3">
            <div className="flex items-center justify-between">
              <span className="font-mono text-xs text-fg">{witness}</span>
              <span className="rounded bg-witness/15 px-1.5 py-0.5 font-mono text-[10px] uppercase text-witness">
                witness
              </span>
            </div>
            <div className="mt-2 font-mono text-xs text-muted">durability quorum · non-serving</div>
          </div>
        </div>
      </section>

      {/* b. Live verification: hero tiles sit with the action that feeds them. */}
      <section id="verification" className={card}>
        <h2 className={head}>Live verification</h2>
        <VerificationProofs
          initWriteMs={snapshot?.writeP50Ms ?? null}
          initCrossMs={snapshot?.consistency?.crossRegionMs ?? null}
          down={down}
          serving={serving}
          witness={witness}
        />
      </section>

      {/* c. Consistency under contention: the no-split-brain race. */}
      <section id="race" className={card}>
        <h2 className={head}>Consistency under contention</h2>
        <div className="mt-3">
          <RaceProof down={down} serving={serving} />
        </div>
      </section>

      {/* d. Failover drills: the anchor target for the band + checklist. */}
      <section id="drills" className={card}>
        <h2 className={head}>Failover drills</h2>
        <ChaosPanel regions={regions} down={down} />
      </section>

      {/* e. Usage: its own small labeled element. */}
      <section className="rounded-lg border border-line bg-surface px-4 py-2.5">
        <span className="font-mono text-xs text-muted">
          {cost
            ? `Usage: $${cost.monthToDate.toFixed(2)} this month · ${dpu} of 100K free DPU · scale-to-zero`
            : 'Usage: scales to zero when idle'}
        </span>
      </section>

      <p className="text-xs text-muted">
        Deep per-service metrics live in your Grafana or Datadog. Quorum is the coordination plane
        that outlives the region they run in.
      </p>
    </div>
  );
}
