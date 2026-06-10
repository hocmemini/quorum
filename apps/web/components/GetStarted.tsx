import Link from 'next/link';

// Get started checklist on the war room (DEC-026): exactly one navigational link, so two distinct
// links can't yield identical results and read as broken; steps 2 and 3 are plain text referencing
// in-place controls (the status-band drill button, the incident below).
export function GetStarted() {
  return (
    <section className="mt-5 rounded-lg border border-accent/30 bg-accent/5 p-4">
      <h2 className="font-mono text-xs font-semibold text-accent">Get started</h2>
      <ol className="mt-2 space-y-1 text-sm text-muted">
        <li>
          1.{' '}
          <Link href="/reliability#verification" className="text-accent hover:underline">
            Open Reliability and run the live proofs: the cross-region write and the no-split-brain
            race
          </Link>
        </li>
        <li>
          2. Run a failover drill with the button above; it opens an incident below to coordinate
          from the survivor.
        </li>
        <li>
          3. Open the drill incident and resolve it from the survivor; ending the drill restores the
          region.
        </li>
      </ol>
    </section>
  );
}
