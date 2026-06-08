'use client';

import { useState } from 'react';
import { cn } from '@/lib/utils';

type Result = {
  commitMs: number;
  crossRegionMs: number;
  readBackMs: number;
  confirmed: boolean;
  wroteRegion: string;
  readRegion: string;
};

export function ProofControls({
  initWriteMs,
  initCrossMs,
}: {
  initWriteMs: number | null;
  initCrossMs: number | null;
}) {
  const [r, setR] = useState<Result | null>(null);
  const [busy, setBusy] = useState(false);
  const write = r?.commitMs ?? initWriteMs;
  const cross = r?.crossRegionMs ?? initCrossMs;

  async function run() {
    setBusy(true);
    try {
      const res = await fetch('/api/proof/write', { method: 'POST' });
      if (res.ok) setR((await res.json()) as Result);
    } finally {
      setBusy(false);
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
            r ? (r.confirmed ? 'border-ok/60' : 'border-sev1/60') : 'border-line',
          )}
        >
          <div className="flex items-center gap-1.5">
            {r ? (
              <span className={cn('size-1.5 rounded-full', r.confirmed ? 'bg-ok' : 'bg-sev1')} />
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
          onClick={run}
          disabled={busy}
          className="rounded-md border border-accent/50 bg-accent/10 px-3 py-1.5 font-mono text-xs text-accent hover:bg-accent/20 disabled:opacity-50"
        >
          {busy ? 'running...' : 'Run a cross-region write'}
        </button>
        <span className="font-mono text-xs text-muted">
          {r
            ? `${r.confirmed ? 'confirmed identical' : 'MISMATCH'} from ${r.readRegion} after ${r.readBackMs} ms (wrote ${r.wroteRegion})`
            : 'writes in one region, reads it back from the other'}
        </span>
      </div>
    </div>
  );
}
