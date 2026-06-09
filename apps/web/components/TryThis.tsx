const STEPS = [
  'Race two writers at one row, or run a cross-region write - measured, not canned',
  'Simulate a us-east-1 outage with the buttons below',
  'Watch the control plane keep serving from us-east-2, then restore',
];

export function TryThis() {
  return (
    <div className="mt-3 rounded-md border border-accent/30 bg-accent/5 p-3">
      <div className="font-mono text-xs font-semibold text-accent">Try this</div>
      <ol className="mt-1 space-y-0.5">
        {STEPS.map((s, i) => (
          <li key={s} className="font-mono text-[11px] text-muted">
            {i + 1}. {s}
          </li>
        ))}
      </ol>
    </div>
  );
}
