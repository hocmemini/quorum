import { getIncidentState } from '@quorum/db';
import Link from 'next/link';
import { SeverityBadge, StatusBadge } from '@/components/badges';
import { IncidentActions } from '@/components/IncidentActions';
import { chaosState, query } from '@/lib/db';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function fmt(d: Date | null): string {
  return d ? new Date(d).toISOString().replace('T', ' ').slice(0, 19) : '-';
}

export default async function IncidentPage(props: { params: Promise<{ id: string }> }) {
  const { id } = await props.params;
  const s = await query((k) => getIncidentState(k, id));
  const { serving, degraded } = await chaosState();

  return (
    <main className="mx-auto max-w-3xl px-6 py-8">
      <Link href="/" className="text-sm text-muted hover:text-fg">
        &larr; war room
      </Link>
      <div className="mt-3 flex flex-wrap items-center gap-3">
        <h1 className="text-xl font-semibold tracking-tight">{s.title ?? id}</h1>
        <StatusBadge status={s.status} />
        <SeverityBadge severity={s.severity} />
      </div>
      <p className="mt-1 font-mono text-xs text-muted">
        opened {fmt(s.openedAt)}
        {s.resolvedAt ? ` / resolved ${fmt(s.resolvedAt)}` : ''} / region {serving}
        {degraded ? ' (failover active)' : ''}
      </p>

      <IncidentActions incidentId={id} />

      <section className="mt-6">
        <h2 className="text-xs font-semibold uppercase tracking-wide text-muted">Action items</h2>
        {s.actions.length === 0 ? (
          <p className="mt-2 text-sm text-muted">None.</p>
        ) : (
          <ul className="mt-2 space-y-1 text-sm">
            {s.actions.map((a) => (
              <li key={a.actionId}>
                {a.title}
                {a.assignee ? <span className="text-muted"> &rarr; {a.assignee}</span> : null}
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="mt-6">
        <h2 className="text-xs font-semibold uppercase tracking-wide text-muted">Timeline</h2>
        {s.notes.length === 0 ? (
          <p className="mt-2 text-sm text-muted">No notes yet.</p>
        ) : (
          <ul className="mt-2 space-y-2">
            {s.notes.map((n) => (
              <li key={n.id} className="border-l-2 border-line pl-3">
                <div className="font-mono text-xs text-muted">
                  {fmt(n.at)} &middot; {n.actor ?? 'system'}
                </div>
                <div className="text-sm">{n.body}</div>
              </li>
            ))}
          </ul>
        )}
      </section>
    </main>
  );
}
