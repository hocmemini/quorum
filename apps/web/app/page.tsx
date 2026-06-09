import {
  getWorkspace,
  type IncidentSummary,
  latestMonitorSnapshot,
  listIncidents,
} from '@quorum/api';
import type { MonitorSnapshot } from '@quorum/db';
import Link from 'next/link';
import { AutoRefresh } from '@/components/AutoRefresh';
import { SeverityBadge, StatusBadge } from '@/components/badges';
import { ControlPlanePanel } from '@/components/ControlPlanePanel';
import { NewIncidentForm } from '@/components/NewIncidentForm';
import { Onboarding } from '@/components/Onboarding';
import { WarmUp } from '@/components/WarmUp';
import { WorkspaceBar } from '@/components/WorkspaceBar';
import { activeOrgId, chaosState, query, regionHealth } from '@/lib/db';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function fmt(d: Date | null): string {
  return d ? new Date(d).toISOString().slice(0, 16).replace('T', ' ') : '-';
}

export default async function Home() {
  const orgId = await activeOrgId();
  if (!orgId) {
    return (
      <main className="mx-auto max-w-5xl px-6 py-8">
        <Onboarding />
      </main>
    );
  }

  // chaosState + regionHealth degrade per-region and never throw, so the panel always renders.
  const chaos = await chaosState();
  const health = await regionHealth();

  let ws: { orgId: string; name: string; joinCode: string } | null = null;
  let incidents: IncidentSummary[] = [];
  let snapshot: MonitorSnapshot | null = null;
  let dbError = false;
  try {
    ws = await query((db) => getWorkspace(db, orgId));
    if (ws) {
      incidents = await query((k) => listIncidents(k, { limit: 50, orgId }));
      snapshot = await query((k) => latestMonitorSnapshot(k));
    }
  } catch {
    dbError = true;
  }
  if (!dbError && !ws) {
    return (
      <main className="mx-auto max-w-5xl px-6 py-8">
        <Onboarding />
      </main>
    );
  }

  const unavailable = chaos.allDown || dbError;
  const open = incidents.filter((i) => i.status !== 'resolved').length;
  const sev1 = incidents.filter((i) => i.severity === 'sev1' && i.status !== 'resolved').length;
  const resolved = incidents.filter((i) => i.status === 'resolved').length;

  return (
    <main className="mx-auto max-w-5xl px-6 py-8">
      <AutoRefresh intervalMs={2500} />
      <WarmUp />
      <header className="flex flex-wrap items-baseline justify-between gap-2">
        <div>
          <h1 className="text-xl font-semibold tracking-tight">Quorum</h1>
          <p className="text-sm text-muted">
            Workspace <span className="text-fg">{ws?.name ?? '(reconnecting)'}</span>
          </p>
        </div>
        {ws ? <WorkspaceBar name={ws.name} joinCode={ws.joinCode} /> : null}
      </header>

      <ControlPlanePanel
        snapshot={snapshot}
        serving={chaos.serving}
        degraded={chaos.degraded}
        allDown={chaos.allDown}
        witness={chaos.witness}
        down={chaos.down}
        regions={chaos.regions}
        health={health}
      />

      {unavailable ? (
        <section className="mt-5 rounded-lg border border-sev2/40 bg-sev2/5 p-4">
          <h2 className="text-sm font-semibold text-sev2">No serving region available</h2>
          <p className="mt-1 text-sm text-muted">
            Both serving regions are marked down. Your data is safe, the {chaos.witness} witness
            holds a durable quorum copy, but no region can serve reads until one recovers. Restore a
            region in the control plane above. In production this requires two simultaneous regional
            outages.
          </p>
        </section>
      ) : (
        <>
          <NewIncidentForm />
          <section className="mt-6 overflow-hidden rounded-lg border border-line">
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-line bg-surface px-4 py-2">
              <h2 className="text-sm font-semibold">Incidents</h2>
              <span className="font-mono text-xs text-muted">
                {open} open · {sev1} sev1 active · {resolved} resolved
              </span>
            </div>
            {incidents.length === 0 ? (
              <p className="p-6 text-sm text-muted">
                No incidents yet. Open one above, or a signal can open one.
              </p>
            ) : (
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-line bg-surface text-left text-xs uppercase tracking-wide text-muted">
                    <th className="px-4 py-2 font-medium">Incident</th>
                    <th className="px-4 py-2 font-medium">Status</th>
                    <th className="px-4 py-2 font-medium">Severity</th>
                    <th className="px-4 py-2 font-medium">Origin</th>
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
                      <td className="px-4 py-2.5 font-mono text-xs text-muted">
                        {fmt(i.openedAt)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
            <p className="border-t border-line px-4 py-2 text-[11px] text-muted">
              A <span className="text-fg">signal</span> is an ingested monitoring event (such as a
              CloudWatch alarm) that can open or update an incident.
            </p>
          </section>
        </>
      )}
    </main>
  );
}
