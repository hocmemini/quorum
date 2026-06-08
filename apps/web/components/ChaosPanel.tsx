'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { cn } from '@/lib/utils';

export function ChaosPanel({ regions, down }: { regions: string[]; down: string[] }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const downSet = new Set(down);

  async function toggle(region: string) {
    setBusy(true);
    const next = downSet.has(region) ? down.filter((r) => r !== region) : [...down, region];
    try {
      await fetch('/api/chaos', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ downRegions: next }),
      });
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mt-5 rounded-lg border border-line bg-surface p-4">
      <div className="flex items-center gap-2">
        <span className="size-2 rounded-full bg-accent" />
        <h2 className="text-sm font-semibold">Resilience demo</h2>
      </div>
      <p className="mt-1 text-sm text-muted">
        Simulate a region outage. This session fails over to a survivor; active-active means no data
        is lost. Scoped to your browser only.
      </p>
      <div className="mt-3 flex flex-wrap gap-2">
        {regions.map((r) => {
          const isDown = downSet.has(r);
          return (
            <button
              key={r}
              type="button"
              disabled={busy}
              onClick={() => toggle(r)}
              className={cn(
                'rounded-md border px-3 py-1.5 font-mono text-xs transition-colors disabled:opacity-50',
                isDown
                  ? 'border-sev1/50 bg-sev1/10 text-sev1'
                  : 'border-line bg-raised hover:border-accent',
              )}
            >
              {isDown ? `${r}: DOWN (restore)` : `Simulate ${r} outage`}
            </button>
          );
        })}
      </div>
    </div>
  );
}
