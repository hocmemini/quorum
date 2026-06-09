'use client';

import { useEffect, useState } from 'react';
import { cn } from '@/lib/utils';

export type RaceResult = {
  conflicted: boolean;
  loserRegion: string;
  retries: number;
  finalStatus: string | null;
  agree: boolean;
  count: number;
  timeline: { type: string; status: string | null; actor: string | null }[];
  regionA: string;
  regionB: string;
};

type Phase = 'idle' | 'attempt' | 'conflict' | 'agreed';

function RegionBox({
  region,
  attempt,
  phase,
  isLoser,
  finalStatus,
}: {
  region: string;
  attempt: string;
  phase: Phase;
  isLoser: boolean;
  finalStatus: string | null;
}) {
  const showConflict = phase === 'conflict' && isLoser;
  const showAgreed = phase === 'agreed';
  return (
    <div
      className={cn(
        'rounded-md border p-3 text-center transition-colors duration-300',
        showConflict
          ? 'border-sev1 bg-sev1/15'
          : showAgreed
            ? 'border-ok bg-ok/10'
            : 'border-line bg-bg',
      )}
    >
      <div className="font-mono text-xs text-fg">{region}</div>
      <div
        className={cn(
          'mt-1 font-mono text-sm font-semibold',
          showConflict ? 'text-sev1' : showAgreed ? 'text-ok' : 'text-fg',
        )}
      >
        {showAgreed ? (finalStatus ?? 'agreed') : attempt}
      </div>
      <div className="mt-0.5 font-mono text-[10px] text-muted">
        {showConflict ? 'conflict - 40001' : showAgreed ? 'agreed' : 'attempting'}
      </div>
    </div>
  );
}

export function RaceVisual({
  result,
  busy,
  outage,
  downRegion,
  survivor,
}: {
  result: RaceResult | null;
  busy: boolean;
  outage: boolean;
  downRegion: string;
  survivor: string;
}) {
  const [phase, setPhase] = useState<Phase>('idle');

  useEffect(() => {
    if (!result) {
      setPhase('idle');
      return;
    }
    setPhase('attempt');
    const t1 = setTimeout(() => setPhase(result.conflicted ? 'conflict' : 'agreed'), 700);
    const t2 = setTimeout(() => setPhase('agreed'), 1500);
    return () => {
      clearTimeout(t1);
      clearTimeout(t2);
    };
  }, [result]);

  // Chaos-aware (DEC-023): the two-region race needs both regions, so it steps aside during a
  // simulated outage with a positive resume-on-restore note rather than transact with a failed region.
  if (outage) {
    return (
      <div className="mt-2 rounded-md border border-sev2/30 bg-sev2/5 p-2 font-mono text-xs text-muted">
        {downRegion} is down for this session - cross-region proofs resume on restore. Serving from{' '}
        {survivor}.
      </div>
    );
  }

  if (!result) {
    return (
      <div className="mt-2 font-mono text-xs text-muted">
        {busy
          ? 'racing two writers across regions...'
          : 'two regions attempt conflicting transitions on one incident; DSQL picks one truth, the loser retries, and both regions read the same committed timeline'}
      </div>
    );
  }

  return (
    <div className="mt-2">
      <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-2">
        <RegionBox
          region={result.regionA}
          attempt="resolved"
          phase={phase}
          isLoser={result.loserRegion === result.regionA}
          finalStatus={result.finalStatus}
        />
        <div className="text-center">
          {phase === 'agreed' && result.agree ? (
            <span className="font-mono text-xs font-semibold text-ok">= no fork</span>
          ) : (
            <span className="font-mono text-[10px] text-muted">vs</span>
          )}
        </div>
        <RegionBox
          region={result.regionB}
          attempt="acknowledged"
          phase={phase}
          isLoser={result.loserRegion === result.regionB}
          finalStatus={result.finalStatus}
        />
      </div>

      {/* Mechanism detail, demoted to a secondary line + tooltip. */}
      <div
        className="mt-1.5 font-mono text-[11px] text-muted"
        title="Version-guarded conditional transitions; the loser's 40001 retry re-reads and reconciles. The rolled-back attempt never commits."
      >
        {result.conflicted
          ? `${result.loserRegion} hit 40001, retried ${result.retries}x`
          : 'serialized cleanly in order'}{' '}
        - both regions read {result.count} events identical
      </div>

      {/* The demonstration incident's linearized, committed timeline. */}
      <div className="mt-1.5 rounded border border-line bg-bg p-2">
        <div className="font-mono text-[10px] uppercase tracking-wide text-muted">
          demonstration incident - committed timeline (resets each race)
        </div>
        <ol className="mt-1 space-y-0.5">
          {result.timeline.map((t, i) => (
            <li key={`${t.type}-${t.actor}-${t.status}`} className="font-mono text-[11px] text-fg">
              {t.type === 'incident.opened'
                ? 'opened'
                : `${t.status} by ${t.actor}${i === result.timeline.length - 1 ? '  (final)' : ''}`}
            </li>
          ))}
        </ol>
      </div>
    </div>
  );
}
