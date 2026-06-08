import { listIncidents } from '@quorum/api';
import Link from 'next/link';
import { SeverityBadge, StatusBadge } from '@/components/badges';
import { ChaosPanel } from '@/components/ChaosPanel';
import { NewIncidentForm } from '@/components/NewIncidentForm';
import { chaosState, query } from '@/lib/db';
import { cn } from '@/lib/utils';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function fmt(d: Date | null): string {
  return d ? new Date(d).toISOString().slice(0, 16).replace('T', ' ') : '-';
}

export default async function Home() {
  const incidents = await query((k) => listIncidents(k, { limit: 50 }));
  const chaos = await chaosState();

  return (
    <main className="mx-auto max-w-5xl px-6 py-8">
      <header className="flex flex-wrap items-baseline justify-between gap-2">
        <div>
          <h1 className="text-xl font-semibold tracking-tight">Quorum</h1>
          <p className="text-sm text-muted">Incident command plane on multi-region Aurora DSQL.</p>
        </div>
        <span
          className={cn(
            'inline-flex items-center gap-2 rounded-full border px-3 py-1 font-mono text-xs',
            chaos.degraded ? 'border-sev2/40 text-sev2' : 'border-line text-muted',
          )}
        >
          <span className={cn('size-1.5 rounded-full', chaos.degraded ? 'bg-sev2' : 'bg-ok')} />
          {chaos.serving}
          {chaos.degraded ? ' (failover active)' : ''}
        </span>
      </header>

      <ChaosPanel regions={chaos.regions} down={chaos.down} />
      <NewIncidentForm />

      <section className="mt-6 overflow-hidden rounded-lg border border-line">
        {incidents.length === 0 ? (
          <p className="p-6 text-sm text-muted">No incidents yet. Open one above.</p>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-line bg-surface text-left text-xs uppercase tracking-wide text-muted">
                <th className="px-4 py-2 font-medium">Incident</th>
                <th className="px-4 py-2 font-medium">Status</th>
                <th className="px-4 py-2 font-medium">Severity</th>
                <th className="px-4 py-2 font-medium">Region</th>
                <th className="px-4 py-2 font-medium">Opened</th>
              </tr>
            </thead>
            <tbody>
              {incidents.map((i) => (
                <tr
                  key={i.incidentId}
                  className="border-b border-line/60 last:border-0 hover:bg-surface/60"
                >
                  <td className="px-4 py-2.5">
                    <Link
                      href={`/incidents/${i.incidentId}`}
                      className="text-accent hover:underline"
                    >
                      {i.title ?? i.incidentId}
                    </Link>
                  </td>
                  <td className="px-4 py-2.5">
                    <StatusBadge status={i.status} />
                  </td>
                  <td className="px-4 py-2.5">
                    <SeverityBadge severity={i.severity} />
                  </td>
                  <td className="px-4 py-2.5 font-mono text-xs text-muted">{i.originRegion}</td>
                  <td className="px-4 py-2.5 font-mono text-xs text-muted">{fmt(i.openedAt)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>
    </main>
  );
}
