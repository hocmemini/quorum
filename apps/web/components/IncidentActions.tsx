'use client';

import { useRouter } from 'next/navigation';
import { type FormEvent, useState } from 'react';

const field =
  'rounded-md border border-line bg-surface px-3 py-1.5 text-sm outline-none focus:border-accent';
const btn =
  'rounded-md border border-line bg-raised px-3 py-1.5 text-sm hover:border-accent disabled:opacity-50';

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
    <div className="mt-4 flex flex-col gap-3">
      <form onSubmit={addNote} className="flex gap-2">
        <input
          value={note}
          onChange={(e) => setNote(e.target.value)}
          placeholder="Add a note to the timeline"
          className={`${field} flex-1`}
        />
        <button type="submit" disabled={busy} className={btn}>
          Note
        </button>
      </form>
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          disabled={busy}
          onClick={() => post({ kind: 'status', status: 'acknowledged' })}
          className={btn}
        >
          Acknowledge
        </button>
        <button
          type="button"
          disabled={busy}
          onClick={() => post({ kind: 'status', status: 'open' })}
          className={btn}
        >
          Reopen
        </button>
        <button
          type="button"
          disabled={busy}
          onClick={() => post({ kind: 'resolve' })}
          className={btn}
        >
          Resolve
        </button>
      </div>
    </div>
  );
}
