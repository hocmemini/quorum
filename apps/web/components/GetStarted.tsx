import Link from 'next/link';

// Get-started checklist on the war room (DEC-024 Part A): product framing for the Try-this strip,
// step one pointing at the Reliability surface.
const STEPS = [
  'Open the Reliability surface to see the control plane verify itself live',
  'Run a cross-region write and the no-split-brain race',
  'Run a failover drill - it opens an incident here to coordinate from the survivor',
];

export function GetStarted() {
  return (
    <section className="mt-5 rounded-lg border border-accent/30 bg-accent/5 p-4">
      <h2 className="font-mono text-xs font-semibold text-accent">Get started</h2>
      <ol className="mt-2 space-y-1">
        {STEPS.map((s, i) => (
          <li key={s} className="text-sm text-muted">
            {i + 1}.{' '}
            <Link href="/reliability" className="text-accent hover:underline">
              {s}
            </Link>
          </li>
        ))}
      </ol>
    </section>
  );
}
