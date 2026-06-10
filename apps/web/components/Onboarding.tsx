'use client';

import { useRouter } from 'next/navigation';
import { type FormEvent, useState } from 'react';
import { cn } from '@/lib/utils';

const field =
  'w-full rounded-md border border-line bg-surface px-3 py-2 text-sm outline-none focus:border-accent';
const btn =
  'rounded-md border border-line bg-raised px-3 py-2 text-sm hover:border-accent disabled:opacity-50';

export function Onboarding() {
  const router = useRouter();
  const [name, setName] = useState('');
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function post(payload: Record<string, string>) {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch('/api/workspace', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(payload),
      });
      if (res.ok) {
        router.refresh();
      } else {
        const b = (await res.json().catch(() => ({}))) as { error?: string };
        setError(b.error ?? `failed (${res.status})`);
      }
    } catch {
      setError('network error');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mx-auto mt-16 max-w-md">
      <h1 className="text-2xl font-semibold tracking-tight">Quorum</h1>
      <p className="mt-1 text-sm text-muted">Incident command plane on multi-region Aurora DSQL.</p>

      {/* Zero-click front door: /demo provisions a fresh, fully-seeded workspace (DEC-024 Part C). */}
      <a
        href="/demo"
        className="mt-6 block rounded-md border border-accent bg-accent/15 px-3 py-3 text-center text-sm font-semibold text-accent transition-colors hover:bg-accent/25"
      >
        Explore the demo
      </a>
      <p className="mt-1 text-center text-xs text-muted">
        Spins up a fresh, fully-seeded war room. No signup, no typing.
      </p>

      <div className="my-5 text-center text-xs uppercase tracking-wide text-muted">
        or make your own
      </div>

      <form
        onSubmit={(e: FormEvent) => {
          e.preventDefault();
          if (name.trim()) post({ action: 'create', name });
        }}
        className="space-y-2"
      >
        <input
          className={field}
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Name your workspace"
        />
        <button type="submit" disabled={busy} className={cn(btn, 'w-full')}>
          {busy ? '...' : 'Create workspace'}
        </button>
      </form>

      <div className="my-4 text-center text-xs uppercase tracking-wide text-muted">or join</div>

      <form
        onSubmit={(e: FormEvent) => {
          e.preventDefault();
          if (code.trim()) post({ action: 'join', code });
        }}
        className="flex gap-2"
      >
        <input
          className={field}
          value={code}
          onChange={(e) => setCode(e.target.value)}
          placeholder="Join code"
        />
        <button type="submit" disabled={busy} className={btn}>
          Join
        </button>
      </form>

      {error ? <p className="mt-3 text-center text-xs text-sev1">{error}</p> : null}
    </div>
  );
}
