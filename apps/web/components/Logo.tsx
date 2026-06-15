import { cn } from '@/lib/utils';

// Quorum mark: three regional nodes joined in a ring, with the top node tinted as the witness.
// Meaningful (a three-way quorum), not decorative filler: the same topology the product defends.
export function Logo({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      aria-hidden="true"
      className={cn('size-6 text-accent', className)}
    >
      <path
        d="M12 4.5 19 16.5 H5 Z"
        stroke="currentColor"
        strokeWidth="1.25"
        strokeLinejoin="round"
        className="opacity-40"
      />
      <circle cx="5" cy="16.5" r="2.1" fill="currentColor" />
      <circle cx="19" cy="16.5" r="2.1" fill="currentColor" />
      <circle cx="12" cy="4.5" r="2.1" className="fill-witness" />
    </svg>
  );
}
