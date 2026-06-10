'use client';

import { useState } from 'react';
import { type RaceResult, RaceVisual } from '@/components/RaceVisual';

// Consistency under contention (DEC-025 split of ProofControls; logic unchanged): the no-split-brain
// race with its two-region visual and the demonstration-incident timeline, its own card.
export function RaceProof({
  down,
  serving,
  witness,
}: {
  down: string[];
  serving: string;
  witness: string;
}) {
  const [race, setRace] = useState<RaceResult | null>(null);
  const [busy, setBusy] = useState(false);
  const outage = down.length > 0;
  const downRegion = down[0] ?? '';

  async function run() {
    setBusy(true);
    try {
      const res = await fetch('/api/proof/race', { method: 'POST' });
      if (res.ok) setRace((await res.json()) as RaceResult);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="rounded-md border border-accent/40 bg-accent/5 p-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="font-mono text-xs font-semibold text-accent">
          Two writers, one truth, no split-brain
        </span>
        <button
          type="button"
          onClick={run}
          disabled={busy || outage}
          className="rounded-md border border-accent/60 bg-accent/15 px-3 py-1.5 font-mono text-xs text-accent hover:bg-accent/25 disabled:opacity-50"
        >
          {busy ? 'racing...' : 'Race two writers'}
        </button>
      </div>
      <RaceVisual
        result={race}
        busy={busy}
        outage={outage}
        downRegion={downRegion}
        survivor={serving}
        witness={witness}
      />
    </div>
  );
}
