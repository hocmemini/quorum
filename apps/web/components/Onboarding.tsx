'use client';

import { useRouter } from 'next/navigation';
import { type FormEvent, useState } from 'react';
import { Logo } from '@/components/Logo';
import { cn } from '@/lib/utils';

const field =
  'w-full rounded-md border border-line bg-surface px-3 py-2 text-sm outline-none transition-colors focus:border-accent';
const btn =
  'rounded-md border border-line bg-raised px-3 py-2 text-sm transition-colors hover:border-accent disabled:opacity-50';

export function Onboarding({ throttled = false }: { throttled?: boolean }) {
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
      <div className="flex items-center gap-3">
        <span className="grid size-11 place-items-center rounded-xl border border-line bg-surface shadow-[0_1px_0_0_var(--color-raised)_inset]">
          <Logo className="size-6" />
        </span>
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Quorum</h1>
          <p className="font-mono text-[11px] uppercase tracking-[0.18em] text-muted">
            Incident command plane
          </p>
        </div>
      </div>
      <p className="mt-3 text-sm leading-relaxed text-muted">
        Coordinate incidents on a control plane that stays writable through a full regional outage,
        built on multi-region Aurora DSQL.
      </p>

      <div className="mt-3 flex flex-wrap gap-2 font-mono text-[11px] text-muted">
        {['3 regions', 'witness quorum', 'no split-brain'].map((tag) => (
          <span
            key={tag}
            className="rounded-full border border-line bg-surface px-2 py-0.5 ring-1 ring-inset ring-white/5"
          >
            {tag}
          </span>
        ))}
      </div>

      {throttled ? (
        <p className="mt-4 rounded-md border border-sev2/40 bg-sev2/5 p-3 text-xs text-muted">
          Demo provisioning is busy right now. Join an existing workspace by code below, or try
          again in a few minutes.
        </p>
      ) : null}

      {/* Zero-click front door: /demo provisions a fresh, fully-seeded workspace (DEC-024 Part C). */}
      <a
        href="/demo"
        className="group mt-6 flex items-center justify-between gap-3 rounded-lg border border-accent/70 bg-accent/15 px-4 py-3 text-sm font-semibold text-accent shadow-[0_0_24px_-8px_var(--color-accent)] transition-all hover:border-accent hover:bg-accent/25 hover:shadow-[0_0_32px_-6px_var(--color-accent)]"
      >
        <span>Explore the demo</span>
        <span aria-hidden="true" className="transition-transform group-hover:translate-x-0.5">
          →
        </span>
      </a>
      <p className="mt-1.5 text-center text-xs text-muted">
        Spins up a fresh, fully-seeded war room. No signup, no typing.
      </p>

      <div className="my-5 flex items-center gap-3 text-center text-xs uppercase tracking-wide text-muted">
        <span className="h-px flex-1 bg-line" />
        or make your own
        <span className="h-px flex-1 bg-line" />
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

      <div className="my-4 flex items-center gap-3 text-center text-xs uppercase tracking-wide text-muted">
        <span className="h-px flex-1 bg-line" />
        or join
        <span className="h-px flex-1 bg-line" />
      </div>

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
