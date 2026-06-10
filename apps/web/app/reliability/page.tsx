import { getWorkspace, latestMonitorSnapshot } from '@quorum/api';
import type { MonitorSnapshot } from '@quorum/db';
import { redirect } from 'next/navigation';
import { AutoRefresh } from '@/components/AutoRefresh';
import { ControlPlanePanel } from '@/components/ControlPlanePanel';
import { WorkspaceHeader } from '@/components/WorkspaceHeader';
import { activeOrgId, chaosState, queryHealthy, regionHealth } from '@/lib/db';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// Reliability surface (DEC-024 Part A): the apparatus lives here under product language, separate
// from the calm war-room product surface. Same data, same claims, same measured numbers as before.
export default async function Reliability() {
  const orgId = await activeOrgId();
  if (!orgId) redirect('/');

  const chaos = await chaosState();
  const health = await regionHealth();
  let ws: { orgId: string; name: string; joinCode: string } | null = null;
  let snapshot: MonitorSnapshot | null = null;
  // Chaos-immune reads (DEC-025): through the real pools so the drill + restore controls render in
  // any chaos state, including both-regions-down. Degrade gracefully; never redirect away from here.
  try {
    ws = await queryHealthy((db) => getWorkspace(db, orgId));
  } catch {
    // ignore; the apparatus + restore controls still render from the chaos cookie
  }
  try {
    snapshot = await queryHealthy((k) => latestMonitorSnapshot(k));
  } catch {
    // ignore; the panel renders with a null snapshot
  }

  return (
    <main className="mx-auto max-w-5xl px-6 py-8">
      <AutoRefresh intervalMs={2500} />
      <WorkspaceHeader ws={ws} surface="reliability" />
      <p className="mt-3 max-w-2xl text-sm text-muted">
        Live verification of the control plane across regions: latency, read-your-writes,
        consistency under contention, throughput, and failover drills. Every proof is measured on
        the click, never canned. A failover drill here opens an incident in the war room to
        coordinate from the survivor.
      </p>
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
    </main>
  );
}
