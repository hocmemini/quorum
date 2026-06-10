'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { cn } from '@/lib/utils';

// Status-band drill control (DEC-025): executes in place on the war room, so the drill-to-incident
// recursion happens on the product surface itself. Label matches effect. Healthy -> runs a failover
// drill on the serving region (chaos + drill incident, reusing the existing endpoints and polling);
// drill active -> ends the drill and restores. The incident appears in the list below via existing
// behavior; the serving badge flips via the existing poll.
export function StatusBandDrillButton({
  serving,
  down,
  regions,
}: {
  serving: string;
  down: string[];
  regions: string[];
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const drilling = down.length > 0;
  const target = drilling ? (down[0] ?? serving) : serving;

  async function act() {
    setBusy(true);
    const json = (body: unknown): RequestInit => ({
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    });
    try {
      if (drilling) {
        await fetch('/api/chaos', json({ downRegions: [] }));
        await Promise.all(
          regions.map((r) =>
            fetch('/api/drill', json({ region: r, action: 'resolve' })).catch(() => {}),
          ),
        );
      } else {
        await fetch('/api/chaos', json({ downRegions: [serving] }));
        await fetch('/api/drill', json({ region: serving, action: 'open' })).catch(() => {});
      }
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  return (
    <button
      type="button"
      onClick={act}
      disabled={busy}
      className={cn(
        'rounded-md border px-2.5 py-1 font-mono text-xs disabled:opacity-50',
        drilling
          ? 'border-drill/50 bg-drill/10 text-drill hover:bg-drill/20'
          : 'border-accent/50 bg-accent/10 text-accent hover:bg-accent/20',
      )}
    >
      {busy ? '...' : drilling ? `End drill, restore ${target}` : `Run a failover drill: ${target}`}
    </button>
  );
}
