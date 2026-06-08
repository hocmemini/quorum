'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';

const panel = {
  border: '1px solid var(--border)',
  borderRadius: 8,
  padding: '0.75rem 1rem',
  background: 'var(--panel)',
  marginTop: '1rem',
} as const;

const btn = {
  background: 'var(--bg)',
  border: '1px solid var(--border)',
  borderRadius: 6,
  padding: '0.4rem 0.6rem',
  cursor: 'pointer',
} as const;

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
    <div style={panel}>
      <strong>Resilience demo</strong>
      <span style={{ color: 'var(--muted)' }}>
        {' '}
        — simulate a region outage. This session fails over to a survivor; active-active means no
        data is lost. (Scoped to your browser only.)
      </span>
      <div style={{ display: 'flex', gap: '0.5rem', marginTop: '0.6rem', flexWrap: 'wrap' }}>
        {regions.map((r) => {
          const isDown = downSet.has(r);
          return (
            <button
              key={r}
              type="button"
              disabled={busy}
              onClick={() => toggle(r)}
              style={{
                ...btn,
                borderColor: isDown ? 'var(--sev1)' : 'var(--border)',
                color: isDown ? 'var(--sev1)' : 'var(--text)',
              }}
            >
              {isDown ? `${r}: DOWN (restore)` : `Simulate ${r} outage`}
            </button>
          );
        })}
      </div>
    </div>
  );
}
