'use client';

import { useState } from 'react';
import { cn } from '@/lib/utils';

type WriteResult = {
  commitMs: number;
  crossRegionMs: number;
  readBackMs: number;
  confirmed: boolean;
  wroteRegion: string;
  readRegion: string;
};

type BurstResult = {
  total: number;
  committed: number;
  conflicts: number;
  countA: number;
  countB: number;
  diverged: boolean;
  minMs: number;
  p50Ms: number;
  maxMs: number;
};

type RaceResult = {
  conflicted: boolean;
  loserRegion: string;
  retries: number;
  finalStatus: string | null;
  finalVersion: number | null;
  agree: boolean;
  regionA: string;
  regionB: string;
};

type Kind = 'write' | 'burst' | 'race';

export function ProofControls({
  initWriteMs,
  initCrossMs,
}: {
  initWriteMs: number | null;
  initCrossMs: number | null;
}) {
  const [w, setW] = useState<WriteResult | null>(null);
  const [b, setB] = useState<BurstResult | null>(null);
  const [race, setRace] = useState<RaceResult | null>(null);
  const [busy, setBusy] = useState<'' | Kind>('');
  const write = w?.commitMs ?? initWriteMs;
  const cross = w?.crossRegionMs ?? initCrossMs;

  async function run(kind: Kind) {
    setBusy(kind);
    try {
      const res = await fetch(`/api/proof/${kind}`, { method: 'POST' });
      if (res.ok) {
        const d = await res.json();
        if (kind === 'write') setW(d as WriteResult);
        else if (kind === 'burst') setB(d as BurstResult);
        else setRace(d as RaceResult);
      }
    } finally {
      setBusy('');
    }
  }

  return (
    <div className="mt-3 space-y-3">
      {/* Centerpiece: two writers, one truth, no split-brain (adversarial OCC proof). */}
      <div className="rounded-md border border-accent/40 bg-accent/5 p-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <span className="font-mono text-xs font-semibold text-accent">
            Two writers, one truth, no split-brain
          </span>
          <button
            type="button"
            onClick={() => run('race')}
            disabled={busy !== ''}
            className="rounded-md border border-accent/60 bg-accent/15 px-3 py-1.5 font-mono text-xs text-accent hover:bg-accent/25 disabled:opacity-50"
          >
            {busy === 'race' ? 'racing...' : 'Race two writers'}
          </button>
        </div>
        <div
          className={cn(
            'mt-1.5 font-mono text-xs',
            race && !race.agree ? 'text-sev1' : 'text-muted',
          )}
        >
          {race
            ? `${race.regionA} tried "resolved", ${race.regionB} tried "acknowledged" at once. ${
                race.conflicted
                  ? `${race.loserRegion} hit a serialization conflict (40001), retried ${race.retries}x, reconciled`
                  : 'both serialized cleanly in order'
              }. Settled to ${race.finalStatus} (v${race.finalVersion}); ${
                race.agree ? 'both regions agree, no fork.' : 'FORK DETECTED'
              }`
            : "two regions attempt conflicting transitions on one item; DSQL's OCC picks one truth, the loser's 40001 retry reconciles, and both regions read it identical"}
        </div>
      </div>

      {/* Read-your-writes across regions (strong consistency). */}
      <div>
        <div className="grid grid-cols-2 gap-2">
          <div className="rounded-md border border-line bg-bg px-3 py-2">
            <div className="font-mono text-lg font-semibold text-fg">
              {write != null ? `${write} ms` : '--'}
            </div>
            <div className="mt-0.5 text-[11px] text-muted">write commit (local region)</div>
          </div>
          <div
            className={cn(
              'rounded-md border bg-bg px-3 py-2',
              w ? (w.confirmed ? 'border-ok/60' : 'border-sev1/60') : 'border-line',
            )}
          >
            <div className="flex items-center gap-1.5">
              {w ? (
                <span className={cn('size-1.5 rounded-full', w.confirmed ? 'bg-ok' : 'bg-sev1')} />
              ) : null}
              <span className="font-mono text-lg font-semibold text-fg">
                {cross != null ? `${cross} ms` : '--'}
              </span>
            </div>
            <div className="mt-0.5 text-[11px] text-muted">read-your-writes across regions</div>
          </div>
        </div>
        <div className="mt-2">
          <button
            type="button"
            onClick={() => run('write')}
            disabled={busy !== ''}
            className="rounded-md border border-accent/50 bg-accent/10 px-3 py-1.5 font-mono text-xs text-accent hover:bg-accent/20 disabled:opacity-50"
          >
            {busy === 'write' ? 'running...' : 'Run a cross-region write'}
          </button>
          <div className="mt-1 font-mono text-xs text-muted">
            {w
              ? `committed in ${w.wroteRegion} in ${w.commitMs} ms, read back ${w.confirmed ? 'identical' : 'MISMATCH'} from ${w.readRegion} in ${w.readBackMs} ms - strong consistency`
              : 'write in one region, read it back identical from the other (read-your-writes, strong consistency)'}
          </div>
        </div>
      </div>

      {/* One consistent log, zero divergence (the burst). */}
      <div>
        <button
          type="button"
          onClick={() => run('burst')}
          disabled={busy !== ''}
          className="rounded-md border border-line bg-raised px-3 py-1.5 font-mono text-xs hover:border-accent disabled:opacity-50"
        >
          {busy === 'burst' ? 'bursting...' : 'Burst: 50 concurrent'}
        </button>
        <div className={cn('mt-1 font-mono text-xs', b?.diverged ? 'text-sev1' : 'text-muted')}>
          {b
            ? `${b.committed}/${b.total} committed, ${b.conflicts} conflicts, ${b.minMs}-${b.maxMs} ms spread; both regions read ${b.countA} & ${b.countB} - ${b.diverged ? 'DIVERGENCE' : 'one consistent log, zero divergence'}`
            : '50 simultaneous writes from both regions, then read both regions back identical'}
        </div>
      </div>
    </div>
  );
}
