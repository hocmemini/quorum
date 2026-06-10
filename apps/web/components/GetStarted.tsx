import Link from 'next/link';

// Get-started checklist on the war room (DEC-024/025): honest phrasing - step 1 navigational, step 2
// a destination anchored at the live-verification section, step 3 referencing the band's own in-place
// control rather than presenting itself as a link that acts.
export function GetStarted() {
  return (
    <section className="mt-5 rounded-lg border border-accent/30 bg-accent/5 p-4">
      <h2 className="font-mono text-xs font-semibold text-accent">Get started</h2>
      <ol className="mt-2 space-y-1 text-sm text-muted">
        <li>
          1.{' '}
          <Link href="/reliability" className="text-accent hover:underline">
            Open the Reliability surface to see the control plane verify itself live
          </Link>
        </li>
        <li>
          2.{' '}
          <Link href="/reliability#verification" className="text-accent hover:underline">
            Try the live proofs on Reliability: the cross-region write and the no-split-brain race
          </Link>
        </li>
        <li>
          3. Run a failover drill with the button above; it opens an incident here to coordinate
          from the survivor.
        </li>
      </ol>
    </section>
  );
}
