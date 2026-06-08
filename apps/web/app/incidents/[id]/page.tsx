import { getIncidentState } from '@quorum/db';
import Link from 'next/link';
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
    <main style={{ padding: '2rem', maxWidth: 820, margin: '0 auto' }}>
      <Link href="/" style={{ color: 'var(--muted)' }}>
        &larr; war room
      </Link>
      <h1 style={{ marginBottom: 0 }}>{s.title ?? id}</h1>
      <p style={{ color: 'var(--muted)', marginTop: 4 }}>
        {s.status} | severity {s.severity ?? '-'} | opened {fmt(s.openedAt)}
        {s.resolvedAt ? ` | resolved ${fmt(s.resolvedAt)}` : ''} | region {serving}
        {degraded ? ' (failover active)' : ''}
      </p>

      <IncidentActions incidentId={id} />

      <section style={{ marginTop: '1.5rem' }}>
        <h2 style={{ fontSize: '1rem', color: 'var(--muted)' }}>Action items</h2>
        {s.actions.length === 0 ? (
          <p style={{ color: 'var(--muted)' }}>None.</p>
        ) : (
          <ul>
            {s.actions.map((a) => (
              <li key={a.actionId}>
                {a.title}
                {a.assignee ? (
                  <em style={{ color: 'var(--muted)' }}> &rarr; {a.assignee}</em>
                ) : null}
              </li>
            ))}
          </ul>
        )}
      </section>

      <section style={{ marginTop: '1.5rem' }}>
        <h2 style={{ fontSize: '1rem', color: 'var(--muted)' }}>Timeline</h2>
        {s.notes.length === 0 ? (
          <p style={{ color: 'var(--muted)' }}>No notes yet.</p>
        ) : (
          <ul style={{ listStyle: 'none', padding: 0 }}>
            {s.notes.map((n) => (
              <li
                key={n.id}
                style={{
                  borderLeft: '2px solid var(--border)',
                  padding: '0.25rem 0.75rem',
                  marginBottom: 8,
                }}
              >
                <div style={{ color: 'var(--muted)', fontSize: 12 }}>
                  {fmt(n.at)} | {n.actor ?? 'system'}
                </div>
                <div>{n.body}</div>
              </li>
            ))}
          </ul>
        )}
      </section>
    </main>
  );
}
