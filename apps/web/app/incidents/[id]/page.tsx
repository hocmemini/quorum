import { incidentContext, incidentTimeline } from '@quorum/api';
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

const TYPE_LABEL: Record<string, string> = {
  'incident.opened': 'opened',
  'note.added': 'note',
  'action.created': 'action',
  'action.assigned': 'assigned',
  'status.changed': 'status',
  'severity.changed': 'severity',
  'incident.resolved': 'resolved',
};

export default async function IncidentPage(props: { params: Promise<{ id: string }> }) {
  const { id } = await props.params;
  const s = await query((k) => getIncidentState(k, id));
  const ctx = await query((k) => incidentContext(k, id));
  const timeline = await query((k) => incidentTimeline(k, id));
  const { serving, degraded, regions } = await chaosState();

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
        {s.resolvedAt ? ` / resolved ${fmt(s.resolvedAt)}` : ''} / serving {serving}
        {degraded ? ' (failover active)' : ''}
      </p>

      <div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-3">
        <div className="rounded-md border border-ok/40 bg-ok/5 px-3 py-2 text-xs">
          <span className="text-ok">● consistent</span>
          <span className="text-muted"> across {regions.join(', ')}</span>
        </div>
        <div className="rounded-md border border-line bg-surface px-3 py-2 text-xs">
          <div className="text-muted">opening signal</div>
          <div className="text-fg">
            {ctx.signal
              ? `${ctx.signal.name}${ctx.signal.source ? ` (${ctx.signal.source})` : ''}`
              : 'manually opened'}
          </div>
        </div>
        <div className="rounded-md border border-line bg-surface px-3 py-2 text-xs">
          <div className="text-muted">affected service</div>
          <div className="text-fg">
            {ctx.service
              ? `${ctx.service.name}${ctx.service.tier ? ` · ${ctx.service.tier}` : ''}`
              : 'unspecified'}
          </div>
        </div>
      </div>

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
        <h2 className="text-xs font-semibold uppercase tracking-wide text-muted">
          Append-only timeline
        </h2>
        <ul className="mt-2 space-y-2">
          {timeline.map((e) => (
            <li key={e.eventId} className="border-l-2 border-line pl-3">
              <div className="font-mono text-xs text-muted">
                {fmt(e.at)} · {e.actor ?? 'system'} ·{' '}
                <span className="text-accent">{TYPE_LABEL[e.type] ?? e.type}</span>
              </div>
              <div className="text-sm">{e.summary}</div>
            </li>
          ))}
        </ul>
      </section>
    </main>
  );
}
