type Item = { eventId: string; type: string; actor: string | null; at: Date; incidentId: string };

const LABEL: Record<string, string> = {
  'incident.opened': 'opened',
  'note.added': 'note',
  'action.created': 'action',
  'action.assigned': 'assigned',
  'status.changed': 'status',
  'severity.changed': 'severity',
  'incident.resolved': 'resolved',
};

function ago(at: Date): string {
  const s = Math.max(0, Math.floor((Date.now() - new Date(at).getTime()) / 1000));
  if (s < 60) return `${s}s`;
  if (s < 3600) return `${Math.floor(s / 60)}m`;
  if (s < 86400) return `${Math.floor(s / 3600)}h`;
  return `${Math.floor(s / 86400)}d`;
}

export function ActivityFeed({ items }: { items: Item[] }) {
  return (
    <section className="mt-5 rounded-lg border border-line bg-surface p-4">
      <h2 className="text-sm font-semibold">Live activity</h2>
      <ul className="mt-2 space-y-1.5">
        {items.length === 0 ? (
          <li className="text-xs text-muted">No activity yet.</li>
        ) : (
          items.map((i) => (
            <li key={i.eventId} className="flex items-center gap-2 font-mono text-xs">
              <span className="w-16 shrink-0 rounded bg-bg px-1.5 py-0.5 text-center text-muted">
                {LABEL[i.type] ?? i.type}
              </span>
              <span className="truncate text-fg">{i.actor ?? 'system'}</span>
              <span className="ml-auto shrink-0 text-muted">{ago(i.at)} ago</span>
            </li>
          ))
        )}
      </ul>
    </section>
  );
}
