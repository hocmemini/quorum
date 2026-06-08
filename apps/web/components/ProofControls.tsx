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
  minMs: number;
  p50Ms: number;
  maxMs: number;
};

export function ProofControls({
  initWriteMs,
  initCrossMs,
}: {
  initWriteMs: number | null;
  initCrossMs: number | null;
}) {
  const [w, setW] = useState<WriteResult | null>(null);
  const [b, setB] = useState<BurstResult | null>(null);
  const [busy, setBusy] = useState<'' | 'write' | 'burst'>('');
  const write = w?.commitMs ?? initWriteMs;
  const cross = w?.crossRegionMs ?? initCrossMs;

  async function run(kind: 'write' | 'burst') {
    setBusy(kind);
    try {
      const res = await fetch(`/api/proof/${kind}`, { method: 'POST' });
      if (res.ok) {
        const d = await res.json();
        if (kind === 'write') {
          setB(null);
          setW(d as WriteResult);
        } else {
          setW(null);
          setB(d as BurstResult);
        }
      }
    } finally {
      setBusy('');
    }
  }

  return (
    <div className="mt-3">
      <div className="grid grid-cols-2 gap-2">
        <div className="rounded-md border border-line bg-bg px-3 py-2">
          <div className="font-mono text-lg font-semibold text-fg">
            {write != null ? `${write} ms` : 'run it'}
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
              {cross != null ? `${cross} ms` : 'run it'}
            </span>
          </div>
          <div className="mt-0.5 text-[11px] text-muted">cross-region confirmed visible</div>
        </div>
      </div>
      <div className="mt-2 flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={() => run('write')}
          disabled={busy !== ''}
          className="rounded-md border border-accent/50 bg-accent/10 px-3 py-1.5 font-mono text-xs text-accent hover:bg-accent/20 disabled:opacity-50"
        >
          {busy === 'write' ? 'running...' : 'Run a cross-region write'}
        </button>
        <button
          type="button"
          onClick={() => run('burst')}
          disabled={busy !== ''}
          className="rounded-md border border-line bg-raised px-3 py-1.5 font-mono text-xs hover:border-accent disabled:opacity-50"
        >
          {busy === 'burst' ? 'bursting...' : 'Burst: 50 concurrent'}
        </button>
      </div>
      <div className="mt-1.5 font-mono text-xs text-muted">
        {w
          ? `${w.confirmed ? 'confirmed identical' : 'MISMATCH'} from ${w.readRegion} after ${w.readBackMs} ms (wrote ${w.wroteRegion})`
          : b
            ? `${b.committed}/${b.total} committed, ${b.conflicts} conflicts, p50 ${b.p50Ms} ms (${b.minMs}..${b.maxMs} ms spread)`
            : 'write in one region and confirm it in the other, or burst concurrent writes across both'}
      </div>
    </div>
  );
}
