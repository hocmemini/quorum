'use client';

import { useRouter } from 'next/navigation';
import { type FormEvent, useState } from 'react';

const fieldStyle = {
  background: 'var(--panel)',
  color: 'var(--text)',
  border: '1px solid var(--border)',
  borderRadius: 6,
  padding: '0.5rem',
} as const;

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
    <form
      onSubmit={submit}
      style={{ display: 'flex', gap: '0.5rem', marginTop: '1rem', flexWrap: 'wrap' }}
    >
      <input
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        placeholder="New incident title"
        style={{ ...fieldStyle, flex: 1, minWidth: 220 }}
      />
      <select value={severity} onChange={(e) => setSeverity(e.target.value)} style={fieldStyle}>
        <option value="sev1">sev1</option>
        <option value="sev2">sev2</option>
        <option value="sev3">sev3</option>
      </select>
      <button type="submit" disabled={busy} style={{ ...fieldStyle, cursor: 'pointer' }}>
        {busy ? '...' : 'Open incident'}
      </button>
      {error ? <span style={{ color: 'var(--sev1)', width: '100%' }}>{error}</span> : null}
    </form>
  );
}
