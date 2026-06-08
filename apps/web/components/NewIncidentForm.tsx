'use client';

import { useRouter } from 'next/navigation';
import { type FormEvent, useState } from 'react';

const field =
  'rounded-md border border-line bg-surface px-3 py-1.5 text-sm outline-none focus:border-accent';

export function NewIncidentForm() {
  const router = useRouter();
  const [title, setTitle] = useState('');
  const [severity, setSeverity] = useState('sev2');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!title.trim()) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch('/api/incidents', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ title, severity }),
      });
      if (res.ok) {
        setTitle('');
        router.refresh();
      } else {
        const body = (await res.json().catch(() => ({}))) as { error?: string };
        setError(body.error ?? `request failed (${res.status})`);
      }
    } catch {
      setError('network error');
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className="mt-4 flex flex-wrap gap-2">
      <input
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        placeholder="New incident title"
        className={`${field} min-w-56 flex-1`}
      />
      <select value={severity} onChange={(e) => setSeverity(e.target.value)} className={field}>
        <option value="sev1">sev1</option>
        <option value="sev2">sev2</option>
        <option value="sev3">sev3</option>
      </select>
      <button
        type="submit"
        disabled={busy}
        className="rounded-md border border-line bg-raised px-3 py-1.5 text-sm hover:border-accent disabled:opacity-50"
      >
        {busy ? '...' : 'Open incident'}
      </button>
      {error ? <span className="w-full text-xs text-sev1">{error}</span> : null}
    </form>
  );
}
