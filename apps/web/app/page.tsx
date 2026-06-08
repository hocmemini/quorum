import { listIncidents } from '@quorum/api';
import Link from 'next/link';
import { ChaosPanel } from '@/components/ChaosPanel';
import { NewIncidentForm } from '@/components/NewIncidentForm';
import { chaosState, query } from '@/lib/db';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const sevColor: Record<string, string> = {
  sev1: 'var(--sev1)',
  sev2: 'var(--sev2)',
  sev3: 'var(--sev3)',
};

function fmt(d: Date | null): string {
  return d ? new Date(d).toISOString().slice(0, 16).replace('T', ' ') : '-';
}

export default async function Home() {
  const incidents = await query((k) => listIncidents(k, { limit: 50 }));
  const chaos = await chaosState();

  return (
    <main style={{ padding: '2rem', maxWidth: 960, margin: '0 auto' }}>
      <header style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
        <h1 style={{ margin: 0 }}>Quorum</h1>
        <span style={{ color: chaos.degraded ? 'var(--sev2)' : 'var(--muted)' }}>
          serving region: {chaos.serving}
          {chaos.degraded ? ' (failover active)' : ''}
        </span>
      </header>
      <p style={{ color: 'var(--muted)' }}>Incident command plane on multi-region Aurora DSQL.</p>

      <ChaosPanel regions={chaos.regions} down={chaos.down} />
      <NewIncidentForm />

      <section style={{ marginTop: '1.5rem' }}>
        {incidents.length === 0 ? (
          <p style={{ color: 'var(--muted)' }}>No incidents yet. Open one above.</p>
        ) : (
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ textAlign: 'left', color: 'var(--muted)' }}>
                <th style={{ padding: '0.5rem' }}>Incident</th>
                <th>Status</th>
                <th>Severity</th>
                <th>Region</th>
                <th>Opened</th>
              </tr>
            </thead>
            <tbody>
              {incidents.map((i) => (
                <tr key={i.incidentId} style={{ borderTop: '1px solid var(--border)' }}>
                  <td style={{ padding: '0.5rem' }}>
                    <Link href={`/incidents/${i.incidentId}`} style={{ color: 'var(--accent)' }}>
                      {i.title ?? i.incidentId}
                    </Link>
                  </td>
                  <td>{i.status}</td>
                  <td style={{ color: i.severity ? sevColor[i.severity] : undefined }}>
                    {i.severity ?? '-'}
                  </td>
                  <td>{i.originRegion}</td>
                  <td>{fmt(i.openedAt)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>
    </main>
  );
}
