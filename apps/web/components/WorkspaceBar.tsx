'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';

export function WorkspaceBar({ name: _name, joinCode }: { name: string; joinCode: string }) {
  const router = useRouter();
  const [copied, setCopied] = useState(false);

  async function share() {
    try {
      await navigator.clipboard.writeText(`${window.location.origin}/join/${joinCode}`);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // clipboard unavailable; ignore
    }
  }

  async function leave() {
    await fetch('/api/workspace', { method: 'DELETE' });
    router.refresh();
  }

  return (
    <div className="flex items-center gap-3 font-mono text-xs text-muted">
      <button
        type="button"
        onClick={share}
        className="rounded-md border border-line px-2 py-1 hover:border-accent"
      >
        {copied ? 'link copied' : `share ${joinCode}`}
      </button>
      <button type="button" onClick={leave} className="hover:text-fg">
        switch
      </button>
    </div>
  );
}
