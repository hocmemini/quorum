'use client';

import { useState } from 'react';
import { cn } from '@/lib/utils';

type WriteResult = {
  commitMs: number;
  crossRegionMs?: number;
  readBackMs?: number;
  confirmed?: boolean;
  wroteRegion?: string;
  readRegion?: string;
  survivorOnly?: boolean;
  survivor?: string;
  witness?: string;
};

type BurstResult = {
  total: number;
  committed: number;
  conflicts: number;
  minMs: number;
  maxMs: number;
  countA?: number;
  countB?: number;
  diverged?: boolean;
  survivorOnly?: boolean;
  survivor?: string;
};

// Live verification (DEC-025 split of ProofControls; logic unchanged). DEC-026: with both regions
// down (serving === 'none') the writing proofs step aside like the race - disabled, with the
// banner's resume-on-restore vocabulary - and no copy interpolates a null survivor.
export function VerificationProofs({
  initWriteMs,
  initCrossMs,
  down,
  serving,
  witness,
}: {
  initWriteMs: number | null;
  initCrossMs: number | null;
  down: string[];
  serving: string;
  witness: string;
}) {
  const [w, setW] = useState<WriteResult | null>(null);
  const [b, setB] = useState<BurstResult | null>(null);
  const [busy, setBusy] = useState<'' | 'write' | 'burst'>('');

  const allDown = serving === 'none';
  const outage = down.length > 0 && !allDown;
  const downRegion = down[0] ?? '';
  const write = w?.commitMs ?? initWriteMs;
  const cross = w?.crossRegionMs ?? initCrossMs;
  const stepAside = `No serving region for this session; proofs resume on restore. Committed data is safe via the ${witness} witness.`;

  async function run(kind: 'write' | 'burst') {
    setBusy(kind);
    try {
      const res = await fetch(`/api/proof/${kind}`, { method: 'POST' });
      if (res.ok) {
        const d = await res.json();
        if (kind === 'write') setW(d as WriteResult);
        else setB(d as BurstResult);
      }
    } finally {
      setBusy('');
    }
  }

  return (
    <div className="space-y-3">
      <div>
        <div className="grid grid-cols-2 gap-2">
          {allDown ? (
            <>
              <div className="rounded-md border border-sev2/40 bg-bg px-3 py-2">
                <div className="font-mono text-sm font-semibold text-sev2">no serving region</div>
                <div className="mt-0.5 text-[11px] text-muted">
                  committed data safe via {witness} witness
                </div>
              </div>
              <div className="rounded-md border border-sev2/40 bg-bg px-3 py-2">
                <div className="font-mono text-sm font-semibold text-sev2">writes paused</div>
                <div className="mt-0.5 text-[11px] text-muted">resume when a region recovers</div>
              </div>
            </>
          ) : (
            <>
              <div className="rounded-md border border-line bg-bg px-3 py-2 transition-colors hover:border-accent/40">
                <div className="font-mono text-lg font-semibold tabular-nums text-fg">
                  {write != null ? (
                    <>
                      {write}
                      <span className="ml-0.5 text-xs font-normal text-muted">ms</span>
                    </>
                  ) : (
                    '--'
                  )}
                </div>
                <div className="mt-0.5 text-[11px] text-muted">
                  write commit ({outage ? `survivor ${serving}` : 'local region'})
                </div>
              </div>
              {outage ? (
                <div className="rounded-md border border-sev2/40 bg-bg px-3 py-2">
                  <div className="font-mono text-sm font-semibold text-sev2">
                    {downRegion} unreachable
                  </div>
                  <div className="mt-0.5 text-[11px] text-muted">
                    serving from {serving}, durable via {witness} witness
                  </div>
                </div>
              ) : (
                <div
                  className={cn(
                    'rounded-md border bg-bg px-3 py-2',
                    w?.confirmed === true
                      ? 'border-ok/60'
                      : w?.confirmed === false
                        ? 'border-sev1/60'
                        : 'border-line',
                  )}
                >
                  <div className="flex items-center gap-1.5">
                    {w && w.confirmed !== undefined ? (
                      <span
                        className={cn('size-1.5 rounded-full', w.confirmed ? 'bg-ok' : 'bg-sev1')}
                      />
                    ) : null}
                    <span className="font-mono text-lg font-semibold tabular-nums text-fg">
                      {cross != null ? (
                        <>
                          {cross}
                          <span className="ml-0.5 text-xs font-normal text-muted">ms</span>
                        </>
                      ) : (
                        '--'
                      )}
                    </span>
                  </div>
                  <div className="mt-0.5 text-[11px] text-muted">
                    read-your-writes across regions
                  </div>
                </div>
              )}
            </>
          )}
        </div>
        <div className="mt-2">
          <button
            type="button"
            onClick={() => run('write')}
            disabled={busy !== '' || allDown}
            className="rounded-md border border-accent/50 bg-accent/10 px-3 py-1.5 font-mono text-xs text-accent hover:bg-accent/20 disabled:opacity-50"
          >
            {busy === 'write'
              ? 'running...'
              : `Run a ${outage ? 'survivor-only' : 'cross-region'} write`}
          </button>
          <div className="mt-1 font-mono text-xs text-muted">
            {allDown
              ? stepAside
              : w?.survivorOnly && outage
                ? `committed to ${w.survivor}, durable via the ${w.witness} witness quorum, ${w.commitMs} ms`
                : w && !w.survivorOnly && !outage
                  ? `committed in ${w.wroteRegion} in ${w.commitMs} ms, read back ${w.confirmed ? 'identical' : 'MISMATCH'} from ${w.readRegion} in ${w.readBackMs} ms - strong consistency`
                  : outage
                    ? `${downRegion} is down for this session; commits go to ${serving}, durable via the ${witness} witness quorum`
                    : 'write in one region, read it back identical from the other (read-your-writes, strong consistency)'}
          </div>
        </div>
      </div>

      <div>
        <button
          type="button"
          onClick={() => run('burst')}
          disabled={busy !== '' || allDown}
          className="rounded-md border border-line bg-raised px-3 py-1.5 font-mono text-xs hover:border-accent disabled:opacity-50"
        >
          {busy === 'burst' ? 'bursting...' : 'Burst: 50 concurrent'}
        </button>
        <div className={cn('mt-1 font-mono text-xs', b?.diverged ? 'text-sev1' : 'text-muted')}>
          {allDown
            ? stepAside
            : b?.survivorOnly && outage
              ? `${b.committed}/${b.total} committed to ${b.survivor}, durable via quorum, ${b.conflicts} conflicts, ${b.minMs}-${b.maxMs} ms spread`
              : b && !b.survivorOnly && !outage
                ? `${b.committed}/${b.total} committed, ${b.conflicts} conflicts, ${b.minMs}-${b.maxMs} ms spread; both regions read ${b.countA} & ${b.countB} - ${b.diverged ? 'DIVERGENCE' : 'one consistent log, zero divergence'}`
                : outage
                  ? `survivor-only during the outage: all 50 commit to ${serving}, durable via quorum`
                  : '50 simultaneous writes from both regions, then read both regions back identical'}
        </div>
      </div>
    </div>
  );
}
