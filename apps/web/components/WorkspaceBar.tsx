'use client';

import { useState } from 'react';
import { SwitchOverlay } from '@/components/SwitchOverlay';

export function WorkspaceBar({ name, joinCode }: { name: string; joinCode: string }) {
  const [copied, setCopied] = useState(false);
  const [switching, setSwitching] = useState(false);

  async function share() {
    try {
      await navigator.clipboard.writeText(`${window.location.origin}/join/${joinCode}`);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // clipboard unavailable; ignore
    }
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
      {/* Switch (DEC-028): opens the switcher without clearing the session, so cancel/return lands
          back in this workspace rather than the splash. */}
      <button type="button" onClick={() => setSwitching(true)} className="hover:text-fg">
        switch
      </button>
      {switching ? <SwitchOverlay currentName={name} onClose={() => setSwitching(false)} /> : null}
    </div>
  );
}
