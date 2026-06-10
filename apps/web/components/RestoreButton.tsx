'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';

// Guaranteed exit from the both-regions-down state (DEC-025): clears the session chaos cookie and
// resolves any open drill incidents (idempotent, DEC-024), then refreshes. Lives inline in the
// no-serving-region banner so the escape exists exactly where the trap is explained.
export function RestoreButton({ regions }: { regions: string[] }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  async function restore() {
    setBusy(true);
    try {
      await fetch('/api/chaos', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ downRegions: [] }),
      });
      await Promise.all(
        regions.map((r) =>
          fetch('/api/drill', {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ region: r, action: 'resolve' }),
          }).catch(() => {}),
        ),
      );
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  return (
    <button
      type="button"
      onClick={restore}
      disabled={busy}
      className="mt-3 rounded-md border border-ok/50 bg-ok/10 px-3 py-1.5 font-mono text-xs text-ok hover:bg-ok/20 disabled:opacity-50"
    >
      {busy ? 'restoring...' : 'End drills, restore all regions'}
    </button>
  );
}
