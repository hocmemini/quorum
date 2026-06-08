import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';

function Pill({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <span
      className={cn(
        'inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium',
        className,
      )}
    >
      {children}
    </span>
  );
}

const severityClass: Record<string, string> = {
  sev1: 'bg-sev1/15 text-sev1',
  sev2: 'bg-sev2/15 text-sev2',
  sev3: 'bg-sev3/15 text-sev3',
};

const statusClass: Record<string, string> = {
  open: 'bg-sev2/15 text-sev2',
  acknowledged: 'bg-accent/15 text-accent',
  resolved: 'bg-ok/15 text-ok',
};

export function SeverityBadge({ severity }: { severity: string | null }) {
  if (!severity) return <span className="text-muted">-</span>;
  return <Pill className={severityClass[severity] ?? 'bg-line text-muted'}>{severity}</Pill>;
}

export function StatusBadge({ status }: { status: string }) {
  return <Pill className={statusClass[status] ?? 'bg-line text-muted'}>{status}</Pill>;
}
