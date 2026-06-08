import { cn } from '@/lib/utils';

export type Metric = { label: string; value: string | number; tone: string };

const toneClass: Record<string, string> = {
  sev1: 'text-sev1',
  ok: 'text-ok',
  accent: 'text-accent',
  fg: 'text-fg',
};

export function MetricsPanel({ metrics }: { metrics: Metric[] }) {
  return (
    <section className="mt-5">
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        {metrics.map((m) => (
          <div key={m.label} className="rounded-lg border border-line bg-surface p-3">
            <div className={cn('font-mono text-xl font-semibold', toneClass[m.tone] ?? 'text-fg')}>
              {m.value}
            </div>
            <div className="mt-0.5 text-xs text-muted">{m.label}</div>
          </div>
        ))}
      </div>
    </section>
  );
}
