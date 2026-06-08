'use client';

import { useRouter } from 'next/navigation';
import { type FormEvent, useState } from 'react';

const field = {
  background: 'var(--panel)',
  color: 'var(--text)',
  border: '1px solid var(--border)',
  borderRadius: 6,
  padding: '0.5rem',
} as const;

export function IncidentActions({ incidentId }: { incidentId: string }) {
  const router = useRouter();
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);

  async function post(payload: Record<string, unknown>) {
    setBusy(true);
    try {
      const res = await fetch(`/api/incidents/${incidentId}/events`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(payload),
      });
      if (res.ok) router.refresh();
    } finally {
      setBusy(false);
    }
  }

  async function addNote(e: FormEvent) {
    e.preventDefault();
    if (!note.trim()) return;
    await post({ kind: 'note', body: note });
    setNote('');
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem', marginTop: '1rem' }}>
      <form onSubmit={addNote} style={{ display: 'flex', gap: '0.5rem' }}>
        <input
          value={note}
          onChange={(e) => setNote(e.target.value)}
          placeholder="Add a note to the timeline"
          style={{ ...field, flex: 1 }}
        />
        <button type="submit" disabled={busy} style={{ ...field, cursor: 'pointer' }}>
          Note
        </button>
      </form>
      <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
        <button
          type="button"
          disabled={busy}
          onClick={() => post({ kind: 'status', status: 'acknowledged' })}
          style={{ ...field, cursor: 'pointer' }}
        >
          Acknowledge
        </button>
        <button
          type="button"
          disabled={busy}
          onClick={() => post({ kind: 'status', status: 'open' })}
          style={{ ...field, cursor: 'pointer' }}
        >
          Reopen
        </button>
        <button
          type="button"
          disabled={busy}
          onClick={() => post({ kind: 'resolve' })}
          style={{ ...field, cursor: 'pointer' }}
        >
          Resolve
        </button>
      </div>
    </div>
  );
}
