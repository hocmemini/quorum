'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { cn } from '@/lib/utils';

export function ChaosPanel({ regions, down }: { regions: string[]; down: string[] }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [fail, setFail] = useState<{ failoverMs: number; served: string } | null>(null);
  const downSet = new Set(down);

  async function toggle(region: string) {
    setBusy(true);
    const goingDown = !downSet.has(region);
    const next = goingDown ? [...down, region] : down.filter((r) => r !== region);
    try {
      await fetch('/api/chaos', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ downRegions: next }),
      });
      if (goingDown) {
        // The chaos cookie is now set; measure the real time to serve from the survivor.
        try {
          const res = await fetch('/api/proof/failover', { method: 'POST' });
          if (res.ok) setFail(await res.json());
        } catch {
          // best-effort; the serving badge still proves the failover
        }
      } else {
        setFail(null);
      }
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mt-3">
      <p className="text-xs text-muted">
        Simulate a region outage; this session fails over to the survivor (active-active, no data
        lost), and the status above updates live.
      </p>
      <div className="mt-2 flex flex-wrap gap-2">
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
      {fail ? (
        <p className="mt-2 font-mono text-xs text-ok">
          failed over to {fail.served} in {fail.failoverMs} ms
        </p>
      ) : null}
    </div>
  );
}
