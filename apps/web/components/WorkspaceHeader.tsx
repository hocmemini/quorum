import Link from 'next/link';
import { WorkspaceBar } from '@/components/WorkspaceBar';
import { cn } from '@/lib/utils';

// Shared workspace header (DEC-024 Part A): the war room and the Reliability surface both mount it,
// with a nav between the two product surfaces.
export function WorkspaceHeader({
  ws,
  surface,
}: {
  ws: { name: string; joinCode: string } | null;
  surface: 'war-room' | 'reliability';
}) {
  const link = (href: string, label: string, active: boolean) => (
    <Link
      href={href}
      className={cn(
        'border-b-2 pb-0.5 transition-colors',
        active ? 'border-accent text-fg' : 'border-transparent text-muted hover:text-fg',
      )}
    >
      {label}
    </Link>
  );
  return (
    <header className="flex flex-wrap items-baseline justify-between gap-2">
      <div>
        <h1 className="text-xl font-semibold tracking-tight">Quorum</h1>
        <nav className="mt-1 flex gap-4 font-mono text-xs">
          {link('/', 'War room', surface === 'war-room')}
          {link('/reliability', 'Reliability', surface === 'reliability')}
        </nav>
      </div>
      {ws ? <WorkspaceBar name={ws.name} joinCode={ws.joinCode} /> : null}
    </header>
  );
}
