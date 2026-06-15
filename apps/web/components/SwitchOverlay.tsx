'use client';

import { useRouter } from 'next/navigation';
import { type FormEvent, useEffect, useState } from 'react';
import { cn } from '@/lib/utils';

const field =
  'w-full rounded-md border border-line bg-bg px-3 py-2 text-sm outline-none focus:border-accent';
const btn =
  'rounded-md border border-line bg-raised px-3 py-2 text-sm hover:border-accent disabled:opacity-50';

// In-workspace switcher (DEC-028): create a new workspace (rate-limited) or join an existing one by
// code (never limited), WITHOUT clearing the session first - so closing or returning always lands
// back in the current workspace, never the splash. The over-limit case renders in place with the same
// escapes: return to workspace, join by code, and a retry hint.
export function SwitchOverlay({
  currentName,
  onClose,
}: {
  currentName: string;
  onClose: () => void;
}) {
  const router = useRouter();
  const [name, setName] = useState('');
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [retryMins, setRetryMins] = useState<number | null>(null);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose();
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  async function post(payload: Record<string, string>) {
    setBusy(true);
    setError(null);
    setRetryMins(null);
    try {
      const res = await fetch('/api/workspace', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(payload),
      });
      if (res.ok) {
        router.refresh();
        return;
      }
      const b = (await res.json().catch(() => ({}))) as { error?: string; retryAfter?: number };
      if (res.status === 429) {
        setRetryMins(Math.max(1, Math.ceil((b.retryAfter ?? 600) / 60)));
        setError(b.error ?? 'Too many new workspaces right now.');
      } else {
        setError(b.error ?? `failed (${res.status})`);
      }
    } catch {
      setError('network error');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-black/60 p-4">
      <div className="w-full max-w-md rounded-lg border border-line bg-surface p-5">
        <div className="flex items-center justify-between gap-3">
          <h2 className="text-sm font-semibold">Switch workspace</h2>
          <button
            type="button"
            onClick={onClose}
            className="font-mono text-xs text-accent hover:underline"
          >
            return to {currentName}
          </button>
        </div>

        {retryMins !== null ? (
          <div className="mt-3 rounded-md border border-sev2/40 bg-sev2/5 p-3 text-xs text-muted">
            {error} You can still join an existing workspace by code below, or return to{' '}
            {currentName}. New ones open up again in about{' '}
            <span className="font-mono text-sev2">
              {retryMins} minute{retryMins === 1 ? '' : 's'}
            </span>
            .
          </div>
        ) : error ? (
          <p className="mt-3 text-xs text-sev1">{error}</p>
        ) : null}

        <form
          onSubmit={(e: FormEvent) => {
            e.preventDefault();
            if (name.trim()) post({ action: 'create', name });
          }}
          className="mt-4 space-y-2"
        >
          <div className="font-mono text-xs text-muted">Create a new workspace</div>
          <input
            className={field}
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Name a new workspace"
          />
          <button type="submit" disabled={busy} className={cn(btn, 'w-full')}>
            {busy ? '...' : 'Create'}
          </button>
        </form>

        <form
          onSubmit={(e: FormEvent) => {
            e.preventDefault();
            if (code.trim()) post({ action: 'join', code });
          }}
          className="mt-4 space-y-2"
        >
          <div className="font-mono text-xs text-muted">Join by code (never rate-limited)</div>
          <div className="flex gap-2">
            <input
              className={field}
              value={code}
              onChange={(e) => setCode(e.target.value)}
              placeholder="Join code"
            />
            <button type="submit" disabled={busy} className={btn}>
              Join
            </button>
          </div>
        </form>

        <button
          type="button"
          onClick={onClose}
          className={cn(btn, 'mt-4 w-full border-accent/40 text-accent')}
        >
          Return to {currentName}
        </button>
      </div>
    </div>
  );
}
